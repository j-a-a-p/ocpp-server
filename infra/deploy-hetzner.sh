#!/bin/bash

# Replace the OCPP server VM on Hetzner Cloud and serve it over HTTPS.
#
# Usage: bash infra/deploy-hetzner.sh [--yes]
#
# What a run does:
#   1. Checks. Makes sure the floating IP exists (created only once, reused
#      afterwards) and that the DNS A record of the domain points to it. If not,
#      it stops here and tells you which record to create. Asks to confirm the
#      plan (or --yes). Nothing has been changed yet.
#   2. New VM. Creates it and installs the whole server on it while the old VM
#      keeps serving (infra/install-server.sh install): the cloud API and the
#      station controller as systemd services, both UIs, Flyway, a firewall and
#      Apache. The services do not start yet, there is no database.
#   3. Take over. Stops the services on the VM that holds the floating IP, so
#      nothing is written anymore, downloads and verifies a backup of the
#      database and the Let's Encrypt state, and shuts the old VMs down. Without
#      such a VM the newest local backup in backups/ is used instead.
#      The service is down from here until step 4 has moved the floating IP.
#   4. Finalize. Imports the backup on the new VM, starts the services, moves
#      the floating IP to it, sets up HTTPS for the domain and checks the whole
#      application. Only when every check passes are the old VMs deleted;
#      otherwise they stay, powered off, so you can go back.
#
# When something fails before the floating IP has moved, the old VM is brought
# back (its services started again, or the VM powered on), so the service keeps
# running on it. The new VM is left for inspection; the next run deletes it.
#
# The code that is deployed is this working tree, not what is on GitHub. The
# configuration comes from infra/configuration.ini plus the secrets below.
#
# Old VMs are the servers with the label app=ocpp-server, which this script
# puts on every VM it creates. Other servers are never touched.
#
# Requirements: bash, curl, jq, ssh, scp, ssh-keygen, tar, openssl
#
# Settings (environment, or infra/.hetzner.env for the secrets):
#   HCLOUD_TOKEN           required, Hetzner Cloud API token (read + write)
#   LETSENCRYPT_EMAIL      required, contact address for Let's Encrypt
#   SES_ACCESS_KEY         required, Amazon SES credentials for invitation emails
#   SES_SECRET_KEY         required, (no spaces or % characters)
#   JWT_SECRET             optional, signs the login tokens. Generated on the
#                          first run and saved in infra/.hetzner.env, so it
#                          stays the same on later deployments.
#   API_KEY                optional, the X-API-Key that the machine-to-machine
#                          endpoints of the cloud API require. Generated and
#                          saved like JWT_SECRET.
#   OCPP_DOMAIN            default apt.aircokopen.nu
#   OCPP_LE_STAGING        set to 1 to use the Let's Encrypt staging server.
#                          Use it while testing: the production server allows
#                          only 5 identical certificates per week.
#   HCLOUD_LOCATION        default fsn1; only used when the floating IP is
#                          created. An existing floating IP keeps its location
#                          and the VM is created there.
#   HCLOUD_SERVER_TYPE     default cx23
#   HCLOUD_IMAGE           default ubuntu-26.04
#   OCPP_FLOATING_IP_NAME  default ocpp-server
#   OCPP_DEPLOY_SSH_KEY    default ~/.ssh/ocpp-hetzner-deploy (generated when
#                          missing, the private key never enters this repo)
#   OCPP_PYTHON_VERSION    default 3.12 (as on AWS)
#   OCPP_NODE_VERSION      default 22.12.0, only used to build the UIs
#   OCPP_FLYWAY_VERSION    default 11.10.4

set -euo pipefail
# Backups hold personal data and private keys.
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$REPO_ROOT/backups"
ENV_FILE="$SCRIPT_DIR/.hetzner.env"
CONFIG_TEMPLATE="$SCRIPT_DIR/configuration.ini"

API_URL="${HCLOUD_API_URL:-https://api.hetzner.cloud/v1}"
LOCATION="${HCLOUD_LOCATION:-fsn1}"
SERVER_TYPE="${HCLOUD_SERVER_TYPE:-cx23}"
IMAGE="${HCLOUD_IMAGE:-ubuntu-26.04}"
FIP_NAME="${OCPP_FLOATING_IP_NAME:-ocpp-server}"
SSH_KEY="${OCPP_DEPLOY_SSH_KEY:-$HOME/.ssh/ocpp-hetzner-deploy}"
DOMAIN="${OCPP_DOMAIN:-apt.aircokopen.nu}"
LE_STAGING="${OCPP_LE_STAGING:-0}"
PYTHON_VERSION="${OCPP_PYTHON_VERSION:-3.12}"
NODE_VERSION="${OCPP_NODE_VERSION:-22.12.0}"
FLYWAY_VERSION="${OCPP_FLYWAY_VERSION:-11.10.4}"

SSH_USER="ubuntu"
APP_LABEL="ocpp-server"
REMOTE_DATA_DIR="/home/ubuntu/ocpp-data"

ASSUME_YES=0
LE_EMAIL=""
KNOWN_HOSTS=""
WORK_DIR=""
BUNDLE_FILE=""
CONFIG_FILE=""
SERVER_ID=""
SERVER_NAME=""
SERVER_IP=""
SSH_KEY_ID=""
FIP_ID=""
FIP_IP=""
FIP_LOCATION=""
FIP_SERVER=""
LATEST_BACKUP=""
LE_ARCHIVE=""
OLD_SERVERS_JSON="[]"
OLD_COUNT=0
OLD_ACTIVE_ID=""
OLD_ACTIVE_NAME=""
OLD_ACTIVE_IP=""
# Progress of the take-over, so a failure can bring the old VM back.
OLD_STOPPED=0
OLD_SHUT_DOWN=0
FIP_MOVED=0
DOWNTIME_START=""
VERIFY_FAILED=0

log() {
    echo "==> $*"
}

die() {
    echo "ERROR: $*" >&2
    exit 1
}

# After a failure: while the floating IP still points to the old VM, it can
# simply take over again. Every step may fail itself, so none of them stops
# the cleanup.
bring_back_old_vm() {
    [ -n "$OLD_ACTIVE_ID" ] || return 0
    echo >&2
    if [ "$FIP_MOVED" = 1 ]; then
        echo "The floating IP already points to the new VM $SERVER_NAME. The old VM $OLD_ACTIVE_NAME is" >&2
        echo "powered off but kept. To go back: power it on and assign the floating IP to it in the Hetzner console." >&2
    elif [ "$OLD_SHUT_DOWN" = 1 ]; then
        echo "Powering the old VM $OLD_ACTIVE_NAME on again, it still holds the floating IP." >&2
        if hcloud_api POST "/servers/$OLD_ACTIVE_ID/actions/poweron" "{}" >/dev/null; then
            echo "  Its services start on boot, the old deployment is back in a minute." >&2
        else
            echo "WARNING: could not power it on. Do it in the Hetzner console." >&2
        fi
    elif [ "$OLD_STOPPED" = 1 ]; then
        echo "Starting Apache and the services on the old VM $OLD_ACTIVE_NAME again." >&2
        if ! SSH_TARGET="$OLD_ACTIVE_IP" ssh_vm "sudo systemctl start cloud-api.service && sudo systemctl start ocpp.service && sudo systemctl start apache2.service"; then
            echo "WARNING: could not start them. Run 'sudo systemctl start cloud-api ocpp apache2' on $OLD_ACTIVE_IP." >&2
        fi
    fi
}

cleanup() {
    local code=$?
    set +e
    if [ "$code" -ne 0 ]; then
        bring_back_old_vm
        if [ -n "$LATEST_BACKUP" ] && [ "$OLD_STOPPED" = 1 ]; then
            echo "The newest backup is $LATEST_BACKUP" >&2
        fi
        if [ -n "$SERVER_ID" ]; then
            echo >&2
            echo "The deployment did not finish. VM '$SERVER_NAME' (id $SERVER_ID) was created and is left for inspection." >&2
            echo "Fix the problem and run the script again: it deletes that VM, or delete it in the Hetzner console." >&2
        fi
    fi
    if [ -n "$KNOWN_HOSTS" ]; then
        rm -f "$KNOWN_HOSTS"
    fi
    # Holds the rendered configuration with the secrets in it.
    if [ -n "$WORK_DIR" ]; then
        rm -rf "$WORK_DIR"
    fi
}

require_tools() {
    local tool
    for tool in curl jq ssh scp ssh-keygen awk sed tar tr openssl; do
        command -v "$tool" >/dev/null 2>&1 || die "'$tool' is required but not installed"
    done
}

# Sets KEY from infra/.hetzner.env when it is not already set in the
# environment. A value set in the shell always wins.
load_from_env_file() {
    local key="$1" value
    if [ -n "${!key:-}" ] || [ ! -f "$ENV_FILE" ]; then
        return 0
    fi
    value="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tr -d '\r' | tail -n 1)"
    if [ -n "$value" ]; then
        export "$key=$value"
    fi
}

# Writes KEY=VALUE into infra/.hetzner.env, replacing an existing KEY line.
persist_env_value() {
    local key="$1" value="$2" tmp
    tmp="$(mktemp "$ENV_FILE.XXXXXX")"
    if [ -f "$ENV_FILE" ]; then
        grep -v "^${key}=" "$ENV_FILE" > "$tmp" || true
    fi
    printf '%s=%s\n' "$key" "$value" >> "$tmp"
    mv "$tmp" "$ENV_FILE"
}

# The values end up in an INI file that Python reads with interpolation on, so a
# % would break the application, and whitespace would be cut or split.
check_secret() {
    local name="$1" value="${!1:-}"
    [ -n "$value" ] || die "$name is not set. Add $name=... to $ENV_FILE or export it"
    [[ "$value" =~ ^[^[:space:]%]+$ ]] || die "$name must not contain whitespace or % characters"
}

# Checks the application secrets and generates the JWT secret on the first run.
# Runs before anything is changed, so a missing secret never costs a VM.
ensure_secrets() {
    load_from_env_file SES_ACCESS_KEY
    load_from_env_file SES_SECRET_KEY
    load_from_env_file JWT_SECRET
    check_secret SES_ACCESS_KEY
    check_secret SES_SECRET_KEY

    if [ -z "${JWT_SECRET:-}" ]; then
        JWT_SECRET="$(openssl rand -hex 32)"
        [ -n "$JWT_SECRET" ] || die "could not generate a JWT secret"
        persist_env_value JWT_SECRET "$JWT_SECRET"
        log "Generated a new JWT secret and saved it in $ENV_FILE"
        echo "  Everyone has to log in again after this deployment."
    fi
    check_secret JWT_SECRET

    load_from_env_file API_KEY
    if [ -z "${API_KEY:-}" ]; then
        API_KEY="$(openssl rand -hex 32)"
        [ -n "$API_KEY" ] || die "could not generate an API key"
        persist_env_value API_KEY "$API_KEY"
        log "Generated a new API key and saved it in $ENV_FILE"
    fi
    check_secret API_KEY
}

# Writes infra/configuration.ini to $1 with the @NAME@ placeholders filled in.
# awk with plain string replacement, so characters like & / | in a secret are safe.
render_config() {
    local out="$1"
    [ -f "$CONFIG_TEMPLATE" ] || die "$CONFIG_TEMPLATE is missing"
    # Checked on the template, a secret may contain anything.
    local unknown
    unknown="$(grep -o '@[A-Z_]*@' "$CONFIG_TEMPLATE" | sort -u \
        | grep -vx -e '@DOMAIN@' -e '@SES_ACCESS_KEY@' -e '@SES_SECRET_KEY@' -e '@JWT_SECRET@' -e '@API_KEY@' || true)"
    [ -z "$unknown" ] || die "$CONFIG_TEMPLATE has a placeholder this script does not know: ${unknown//$'\n'/ }"
    DOMAIN="$DOMAIN" SES_ACCESS_KEY="$SES_ACCESS_KEY" SES_SECRET_KEY="$SES_SECRET_KEY" \
    JWT_SECRET="$JWT_SECRET" API_KEY="$API_KEY" awk '
        # One pass over the line: text that was filled in is never scanned again.
        function fill(line,    names, count, i, pos, best, found, result) {
            count = split("DOMAIN SES_ACCESS_KEY SES_SECRET_KEY JWT_SECRET API_KEY", names, " ")
            result = ""
            while (1) {
                best = 0
                found = ""
                for (i = 1; i <= count; i++) {
                    pos = index(line, "@" names[i] "@")
                    if (pos > 0 && (best == 0 || pos < best)) {
                        best = pos
                        found = names[i]
                    }
                }
                if (best == 0) {
                    break
                }
                result = result substr(line, 1, best - 1) ENVIRON[found]
                line = substr(line, best + length(found) + 2)
            }
            return result line
        }
        {
            line = $0
            sub(/\r$/, "", line)
            print fill(line)
        }' "$CONFIG_TEMPLATE" > "$out"
}

# Packs the application into $BUNDLE_FILE: the code, the UI sources and only the
# infra files the VM needs. Never the env file, the backups or built artifacts.
build_bundle() {
    local stage="$WORK_DIR/stage" file
    BUNDLE_FILE="$WORK_DIR/ocpp-server.tar.gz"
    mkdir -p "$stage/ocpp-server"

    (cd "$REPO_ROOT" && tar \
        --exclude='__pycache__' --exclude='*.pyc' --exclude='node_modules' \
        --exclude='dist' --exclude='*.local' --exclude='.gitignore' \
        -cf - cloud-api station-controller management-ui resident-ui \
        infra/install-server.sh infra/create-cloud-api-service.sh infra/create-ocpp-service.sh \
        infra/apt.aircokopen.nu-le-ssl.conf infra/web) \
        | tar -xf - -C "$stage/ocpp-server" \
        || die "could not package the application, is a file missing?"

    # A Windows checkout has CRLF line endings, which break shell scripts and
    # Apache configuration on Linux. Fixed in the copy, the repo stays untouched.
    while IFS= read -r -d '' file; do
        tr -d '\r' < "$file" > "$file.tmp"
        cat "$file.tmp" > "$file"
        rm -f "$file.tmp"
    done < <(find "$stage" -type f \( -name '*.sh' -o -name '*.conf' -o -name '*.ini' \
        -o -name '*.service' -o -name '*.txt' -o -name '*.sql' -o -name '*.py' \
        -o -name '*.json' -o -name '*.html' -o -name '*.svg' -o -name '*.css' \
        -o -name '*.js' -o -name '*.ts' -o -name '*.tsx' -o -name '*.md' \
        -o -name '.htaccess' \) -print0)

    chmod -R u=rwX,go=rX "$stage"
    tar -czf "$BUNDLE_FILE" -C "$stage" ocpp-server

    if tar -tzf "$BUNDLE_FILE" | grep -Eq 'hetzner\.env|backups/|\.pem$|\.db$'; then
        die "the bundle contains a secret or data file, refusing to upload it"
    fi
}

# Renders the configuration and builds the bundle. Runs before the old VM is
# touched, so a problem here never happens after something was deleted.
prepare_application() {
    log "Preparing the application bundle"
    WORK_DIR="$(mktemp -d)"
    CONFIG_FILE="$WORK_DIR/configuration.ini"
    render_config "$CONFIG_FILE"
    build_bundle
    echo "  bundle: $(du -h "$BUNDLE_FILE" | awk '{print $1}')"
}

# Calls the Hetzner Cloud API. Prints the JSON response; fails on non-2xx.
hcloud_api() {
    local method="$1" path="$2" body="${3:-}"
    local response status
    local args=(-sS -X "$method" -H "Content-Type: application/json" -w $'\n%{http_code}')
    if [ -n "$body" ]; then
        args+=(-d "$body")
    fi
    # The token goes through a config file descriptor so it does not show up in `ps`.
    response="$(curl "${args[@]}" \
        --config <(printf 'header = "Authorization: Bearer %s"\n' "$HCLOUD_TOKEN") \
        "$API_URL$path")" || {
        echo "ERROR: could not reach the Hetzner API ($API_URL)" >&2
        return 1
    }
    status="${response##*$'\n'}"
    response="${response%$'\n'*}"
    if [[ ! "$status" =~ ^2 ]]; then
        echo "ERROR: Hetzner API $method $path -> HTTP $status: $response" >&2
        return 1
    fi
    printf '%s' "$response"
}

sha256_of() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

# Sets LATEST_BACKUP to the newest local database backup.
find_latest_backup() {
    local files=()
    shopt -s nullglob
    files=("$BACKUP_DIR"/cloud-*.db)
    shopt -u nullglob
    if [ "${#files[@]}" -eq 0 ]; then
        die "no backup found in $BACKUP_DIR and no running VM to back up - run infra/backup-database.sh first"
    fi
    # Names contain a YYYYMMDD-HHMMSS timestamp, so the last one is the newest.
    LATEST_BACKUP="${files[${#files[@]}-1]}"
}

# Sets LE_ARCHIVE to the newest local Let's Encrypt backup, if there is one.
find_latest_le_archive() {
    local files=()
    shopt -s nullglob
    files=("$BACKUP_DIR"/letsencrypt-*.tar.gz)
    shopt -u nullglob
    if [ "${#files[@]}" -gt 0 ]; then
        LE_ARCHIVE="${files[${#files[@]}-1]}"
    fi
}

# Generates the deploy key pair when missing and registers it in the Hetzner
# project (once). Sets SSH_KEY_ID.
ensure_ssh_key() {
    if [ ! -f "$SSH_KEY" ]; then
        log "Generating deploy SSH key $SSH_KEY"
        mkdir -p "$(dirname "$SSH_KEY")"
        ssh-keygen -q -t ed25519 -N "" -C "ocpp-server-hetzner-deploy" -f "$SSH_KEY"
    fi
    if [ ! -f "$SSH_KEY.pub" ]; then
        ssh-keygen -y -f "$SSH_KEY" > "$SSH_KEY.pub"
    fi

    # Hetzner identifies keys by their MD5 fingerprint (aa:bb:...).
    local fingerprint response
    fingerprint="$(ssh-keygen -E md5 -lf "$SSH_KEY.pub" | awk '{print $2}')"
    fingerprint="${fingerprint#MD5:}"

    response="$(hcloud_api GET "/ssh_keys?fingerprint=$fingerprint")"
    SSH_KEY_ID="$(jq -r '.ssh_keys[0].id // empty' <<<"$response")"
    if [ -n "$SSH_KEY_ID" ]; then
        log "SSH key already registered in Hetzner (id $SSH_KEY_ID)"
        return
    fi

    log "Registering SSH key in Hetzner"
    local body
    body="$(jq -n \
        --arg name "ocpp-deploy-${fingerprint//:/}" \
        --arg key "$(cat "$SSH_KEY.pub")" \
        '{name: $name, public_key: $key, labels: {app: "ocpp-server"}}')"
    response="$(hcloud_api POST /ssh_keys "$body")"
    SSH_KEY_ID="$(jq -r '.ssh_key.id' <<<"$response")"
}

# Creates the floating IP on the first run, reuses it afterwards.
# Sets FIP_ID, FIP_IP, FIP_LOCATION and FIP_SERVER (id of the current VM or empty).
ensure_floating_ip() {
    [[ "$FIP_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || die "invalid floating IP name: $FIP_NAME"

    local response fip
    response="$(hcloud_api GET "/floating_ips?name=$FIP_NAME")"
    fip="$(jq -c '.floating_ips[0] // empty' <<<"$response")"

    if [ -z "$fip" ]; then
        log "Creating floating IP '$FIP_NAME' in $LOCATION (first run only)"
        local body
        body="$(jq -n \
            --arg name "$FIP_NAME" \
            --arg location "$LOCATION" \
            '{type: "ipv4", name: $name, home_location: $location,
              description: "OCPP server service address", labels: {app: "ocpp-server"}}')"
        response="$(hcloud_api POST /floating_ips "$body")"
        fip="$(jq -c '.floating_ip' <<<"$response")"
    else
        log "Reusing existing floating IP '$FIP_NAME'"
    fi

    FIP_ID="$(jq -r '.id' <<<"$fip")"
    FIP_IP="$(jq -r '.ip' <<<"$fip")"
    FIP_LOCATION="$(jq -r '.home_location.name' <<<"$fip")"
    FIP_SERVER="$(jq -r '.server // empty' <<<"$fip")"

    if [ "$FIP_LOCATION" != "$LOCATION" ]; then
        echo "NOTE: floating IP lives in $FIP_LOCATION (not $LOCATION); the VM will be created there."
    fi
    log "Floating IP: $FIP_IP ($FIP_LOCATION)"
}

# Prints the IPv4 addresses the domain currently resolves to, one per line.
resolve_domain() {
    if command -v getent >/dev/null 2>&1; then
        getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u || true
    elif command -v python3 >/dev/null 2>&1; then
        python3 -c 'import socket, sys
try:
    print("\n".join(sorted({a[4][0] for a in socket.getaddrinfo(sys.argv[1], None, socket.AF_INET)})))
except OSError:
    pass' "$DOMAIN"
    fi
}

# Let's Encrypt validates over HTTP on the domain, so the A record has to point
# to the floating IP. Stops before anything is deleted when it does not.
check_dns() {
    local resolved
    resolved="$(resolve_domain)"
    if [ "$resolved" = "$FIP_IP" ]; then
        log "DNS ok: $DOMAIN -> $FIP_IP"
        return
    fi
    echo "ERROR: the DNS record of $DOMAIN does not point to the floating IP yet." >&2
    echo "  Create this record, wait until it has propagated, then run this script again:" >&2
    echo "    $DOMAIN.   A   $FIP_IP" >&2
    echo "  Currently resolves to: ${resolved//$'\n'/, }" >&2
    echo "  Nothing has been changed or deleted." >&2
    exit 1
}

# Finds the VMs created by this script. Sets OLD_SERVERS_JSON, OLD_COUNT and,
# when one of them holds the floating IP, OLD_ACTIVE_ID/NAME/IP.
find_old_vms() {
    local response active
    response="$(hcloud_api GET "/servers?label_selector=app%3D$APP_LABEL&per_page=50")"
    OLD_SERVERS_JSON="$(jq -c \
        '[.servers[] | {id: .id, name: .name, status: .status, ip: (.public_net.ipv4.ip // "")}]' \
        <<<"$response")"
    OLD_COUNT="$(jq 'length' <<<"$OLD_SERVERS_JSON")"

    if [ -z "$FIP_SERVER" ]; then
        return
    fi
    active="$(jq -c --argjson id "$FIP_SERVER" '.[] | select(.id == $id)' <<<"$OLD_SERVERS_JSON")"
    [ -n "$active" ] || die "floating IP $FIP_IP is assigned to server $FIP_SERVER, which was not created by this script (no app=$APP_LABEL label). Refusing to touch it."
    OLD_ACTIVE_ID="$(jq -r '.id' <<<"$active")"
    OLD_ACTIVE_NAME="$(jq -r '.name' <<<"$active")"
    OLD_ACTIVE_IP="$(jq -r '.ip' <<<"$active")"
    if [ "$(jq -r '.status' <<<"$active")" != "running" ] || [ -z "$OLD_ACTIVE_IP" ]; then
        die "VM $OLD_ACTIVE_NAME holds the floating IP but is not running, so it cannot be backed up. Start it, or delete it in the Hetzner console and use a local backup."
    fi
}

confirm_plan() {
    if [ "$OLD_COUNT" -eq 0 ]; then
        return 0
    fi
    echo
    echo "About to replace the current deployment:"
    echo "  - create a new VM and install the server on it, while the old one keeps running"
    if [ -n "$OLD_ACTIVE_ID" ]; then
        echo "  - stop the services on $OLD_ACTIVE_NAME ($OLD_ACTIVE_IP) and back up its database and certificates"
    else
        echo "  - no VM holds the floating IP, so the local backup $(basename "$LATEST_BACKUP") is used"
    fi
    echo "  - shut down: $(jq -r '[.[].name] | join(", ")' <<<"$OLD_SERVERS_JSON")"
    echo "  - import the backup, move the floating IP and set up HTTPS for $DOMAIN"
    echo "  - when every check passes, DELETE the old VMs"
    echo
    if [ "$ASSUME_YES" = 1 ]; then
        return 0
    fi
    [ -t 0 ] || die "refusing to delete VMs without confirmation; run it in a terminal or pass --yes"
    local answer
    read -r -p "Continue? [y/N] " answer
    [[ "$answer" =~ ^[Yy]$ ]] || die "aborted, nothing was changed"
}

ssh_vm() {
    ssh "${SSH_OPTS[@]}" -T "$SSH_USER@${SSH_TARGET:-$SERVER_IP}" "$@"
}

# Stops the web server and the services on the VM that holds the floating IP,
# so the backup has every charge and nothing is written after it.
# Order: Apache first, so no new request or charger connection gets in; then the
# station controller, which writes the meter values and the transactions; then
# the cloud API.
stop_old_services() {
    log "Stopping Apache and the services on $OLD_ACTIVE_NAME, the service is down from now on"
    DOWNTIME_START=$SECONDS
    OLD_STOPPED=1
    SSH_TARGET="$OLD_ACTIVE_IP" ssh_vm "sudo systemctl stop apache2.service && sudo systemctl stop ocpp.service && sudo systemctl stop cloud-api.service" \
        || die "could not stop Apache and the services on $OLD_ACTIVE_NAME"
}

# Downloads a verified database snapshot (and the Let's Encrypt state) from the
# VM that holds the floating IP. Sets LATEST_BACKUP and LE_ARCHIVE. A failure
# here starts the services on the old VM again (see cleanup).
backup_old_vm() {
    local ip="$OLD_ACTIVE_IP" stamp db_file remote_sha
    stamp="$(date +%Y%m%d-%H%M%S)"
    db_file="$BACKUP_DIR/cloud-$stamp.db"
    mkdir -p "$BACKUP_DIR"

    log "Backing up the database from $OLD_ACTIVE_NAME ($ip)"
    remote_sha="$(SSH_TARGET="$ip" ssh_vm bash -s -- "$REMOTE_DATA_DIR" <<'REMOTE'
set -euo pipefail
SRC="$1/cloud.db"
DST=/tmp/cloud-backup.db
if [ ! -f "$SRC" ]; then
    echo "no database found at $SRC" >&2
    exit 1
fi
rm -f "$DST"
python3 - "$SRC" "$DST" <<'PY'
import sqlite3
import sys

src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
with dst:
    src.backup(dst)
src.close()
dst.close()

check = sqlite3.connect(sys.argv[2])
status = check.execute("PRAGMA integrity_check").fetchone()[0]
check.close()
if status != "ok":
    sys.exit("integrity check failed: " + status)
PY
sha256sum "$DST" | awk '{print $1}'
REMOTE
)" || die "could not back up the database from $OLD_ACTIVE_NAME"
    scp "${SSH_OPTS[@]}" "$SSH_USER@$ip:/tmp/cloud-backup.db" "$db_file"
    [ "$(sha256_of "$db_file")" = "$remote_sha" ] || die "checksum mismatch on the downloaded backup"
    SSH_TARGET="$ip" ssh_vm "rm -f /tmp/cloud-backup.db"
    LATEST_BACKUP="$db_file"
    log "Database backup saved to $db_file"

    if SSH_TARGET="$ip" ssh_vm "sudo test -d /etc/letsencrypt/live/$DOMAIN"; then
        local le_file="$BACKUP_DIR/letsencrypt-$stamp.tar.gz"
        log "Backing up the Let's Encrypt certificates"
        SSH_TARGET="$ip" ssh_vm "sudo tar -czf /tmp/letsencrypt.tar.gz -C / etc/letsencrypt && sudo chown $SSH_USER /tmp/letsencrypt.tar.gz"
        scp "${SSH_OPTS[@]}" "$SSH_USER@$ip:/tmp/letsencrypt.tar.gz" "$le_file"
        SSH_TARGET="$ip" ssh_vm "rm -f /tmp/letsencrypt.tar.gz"
        LE_ARCHIVE="$le_file"
        log "Certificates saved to $le_file"
    else
        echo "No certificate for $DOMAIN on the old VM, a new one will be requested."
    fi
}

wait_until_off() {
    local id="$1" deadline=$((SECONDS + 120)) status
    while true; do
        status="$(hcloud_api GET "/servers/$id" | jq -r '.server.status')"
        if [ "$status" = "off" ]; then
            return 0
        fi
        if [ "$SECONDS" -ge "$deadline" ]; then
            return 1
        fi
        sleep 3
    done
}

# Shuts every old VM down. They are kept until the new VM has passed its checks.
shutdown_old_vms() {
    local id name status
    while IFS=$'\t' read -r id name status; do
        [ "$status" = "running" ] || continue
        log "Shutting down $name"
        if [ "$id" = "$OLD_ACTIVE_ID" ]; then
            OLD_SHUT_DOWN=1
        fi
        hcloud_api POST "/servers/$id/actions/shutdown" "{}" >/dev/null
        if ! wait_until_off "$id"; then
            log "Graceful shutdown timed out, powering $name off"
            hcloud_api POST "/servers/$id/actions/poweroff" "{}" >/dev/null
            wait_until_off "$id" || die "$name did not power off"
        fi
    done < <(jq -r '.[] | [.id, .name, .status] | @tsv' <<<"$OLD_SERVERS_JSON")
}

delete_old_vms() {
    local id name
    while IFS=$'\t' read -r id name; do
        log "Deleting $name (id $id)"
        hcloud_api DELETE "/servers/$id" >/dev/null
    done < <(jq -r '.[] | [.id, .name] | @tsv' <<<"$OLD_SERVERS_JSON")
}

user_data() {
    cat <<EOF
#cloud-config
hostname: $SERVER_NAME
manage_etc_hosts: true
disable_root: true

users:
  - name: $SSH_USER
    groups: sudo
    shell: /bin/bash
    sudo: ['ALL=(ALL) NOPASSWD:ALL']
    lock_passwd: true
    ssh_authorized_keys:
      - "$(cat "$SSH_KEY.pub")"

package_update: true
package_upgrade: true
packages:
  - python3
  - python3-venv
  - sqlite3
  - curl
  - ca-certificates
  - xz-utils
  - ufw
  - apache2
  - certbot
  - python3-certbot-apache
EOF
}

create_server() {
    SERVER_NAME="ocpp-$(date +%Y%m%d-%H%M%S)"
    log "Creating VM $SERVER_NAME ($SERVER_TYPE, $IMAGE, $FIP_LOCATION)"

    local body response
    body="$(jq -n \
        --arg name "$SERVER_NAME" \
        --arg type "$SERVER_TYPE" \
        --arg image "$IMAGE" \
        --arg location "$FIP_LOCATION" \
        --arg user_data "$(user_data)" \
        --argjson key_id "$SSH_KEY_ID" \
        '{name: $name, server_type: $type, image: $image, location: $location,
          user_data: $user_data, ssh_keys: [$key_id], labels: {app: "ocpp-server"}}')"
    response="$(hcloud_api POST /servers "$body")" || {
        echo "The floating IP is bound to $FIP_LOCATION, so the VM must be created there." >&2
        echo "If the location has no capacity, try another HCLOUD_SERVER_TYPE." >&2
        return 1
    }
    SERVER_ID="$(jq -r '.server.id' <<<"$response")"
    log "VM created (id $SERVER_ID)"
}

wait_for_server() {
    log "Waiting for the VM to be running"
    local deadline=$((SECONDS + 600)) response status
    while true; do
        response="$(hcloud_api GET "/servers/$SERVER_ID")"
        status="$(jq -r '.server.status' <<<"$response")"
        SERVER_IP="$(jq -r '.server.public_net.ipv4.ip // empty' <<<"$response")"
        if [ "$status" = "running" ] && [ -n "$SERVER_IP" ]; then
            break
        fi
        [ "$SECONDS" -lt "$deadline" ] || die "VM not running within 10 minutes (status: $status)"
        sleep 5
    done
    log "VM is running at $SERVER_IP"
}

wait_for_ssh() {
    log "Waiting for SSH and cloud-init on $SERVER_IP"
    local deadline=$((SECONDS + 600))
    until ssh_vm true 2>/dev/null; do
        [ "$SECONDS" -lt "$deadline" ] || die "SSH to $SSH_USER@$SERVER_IP not available within 10 minutes"
        sleep 10
    done
    # Exit 2 means "done with recoverable errors"; what we need is checked below.
    ssh_vm "sudo cloud-init status --wait >/dev/null" || true
    ssh_vm "command -v python3 >/dev/null && command -v certbot >/dev/null && python3 -c 'import ensurepip' && command -v ufw >/dev/null" \
        || die "a required package is missing on the VM, cloud-init did not finish properly"
}

import_backup() {
    log "Uploading $(basename "$LATEST_BACKUP")"
    local local_sha
    local_sha="$(sha256_of "$LATEST_BACKUP")"
    scp "${SSH_OPTS[@]}" "$LATEST_BACKUP" "$SSH_USER@$SERVER_IP:/tmp/cloud-import.db"

    log "Importing into $REMOTE_DATA_DIR/cloud.db"
    ssh_vm bash -s -- "$local_sha" "$REMOTE_DATA_DIR" <<'REMOTE'
set -euo pipefail
EXPECTED="$1"
DATA_DIR="$2"
IMPORT=/tmp/cloud-import.db

echo "$EXPECTED  $IMPORT" | sha256sum -c - >/dev/null
echo "  upload checksum ok"

python3 - "$IMPORT" <<'PY'
import sqlite3
import sys

con = sqlite3.connect(sys.argv[1])
status = con.execute("PRAGMA integrity_check").fetchone()[0]
if status != "ok":
    sys.exit("integrity check failed: " + status)
print("  integrity_check ok")
names = con.execute(
    "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name"
).fetchall()
for (name,) in names:
    count = con.execute('select count(*) from "%s"' % name).fetchone()[0]
    print("  %s: %d rows" % (name, count))
PY

mkdir -p "$DATA_DIR"
if [ -e "$DATA_DIR/cloud.db" ]; then
    mv "$DATA_DIR/cloud.db" "$DATA_DIR/cloud.db.before-import-$(date +%Y%m%d-%H%M%S)"
fi
mv "$IMPORT" "$DATA_DIR/cloud.db"
chmod 600 "$DATA_DIR/cloud.db"
echo "  imported"
REMOTE
}

# Uploads the application and installs everything that does not need the
# database (infra/install-server.sh install). The old VM is still serving.
install_application() {
    log "Uploading the application"
    scp "${SSH_OPTS[@]}" "$BUNDLE_FILE" "$SSH_USER@$SERVER_IP:/tmp/ocpp-server.tar.gz"
    scp "${SSH_OPTS[@]}" "$CONFIG_FILE" "$SSH_USER@$SERVER_IP:/tmp/configuration.ini"
    ssh_vm "mkdir -p /home/$SSH_USER && tar -xzf /tmp/ocpp-server.tar.gz -C /home/$SSH_USER && rm -f /tmp/ocpp-server.tar.gz"

    log "Installing the server on the VM (Python environment, Flyway, UIs, services), this takes a few minutes"
    ssh_vm "FLYWAY_VERSION='$FLYWAY_VERSION' NODE_VERSION='$NODE_VERSION' PYTHON_VERSION='$PYTHON_VERSION' bash /home/$SSH_USER/ocpp-server/infra/install-server.sh install"
}

# Starts the services on the imported database, before the floating IP moves.
start_application() {
    log "Starting the services on the VM"
    ssh_vm "bash /home/$SSH_USER/ocpp-server/infra/install-server.sh start"
}

assign_floating_ip() {
    log "Assigning floating IP $FIP_IP to $SERVER_NAME"
    hcloud_api POST "/floating_ips/$FIP_ID/actions/assign" \
        "$(jq -n --argjson server "$SERVER_ID" '{server: $server}')" >/dev/null
    FIP_MOVED=1

    local deadline=$((SECONDS + 120)) response assigned
    while true; do
        response="$(hcloud_api GET "/floating_ips/$FIP_ID")"
        assigned="$(jq -r '.floating_ip.server // empty' <<<"$response")"
        [ "$assigned" = "$SERVER_ID" ] && break
        [ "$SECONDS" -lt "$deadline" ] || die "floating IP not assigned within 2 minutes"
        sleep 2
    done
}

# Hetzner routes the floating IP to the VM, but the OS has to own the address.
configure_floating_ip_on_vm() {
    [[ "$FIP_IP" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]] || die "unexpected floating IP format: $FIP_IP"
    log "Configuring $FIP_IP on the VM"
    ssh_vm bash -s -- "$FIP_IP" <<'REMOTE'
set -euo pipefail
FIP="$1"
IFACE="$(ip -4 route show default | awk '{print $5; exit}')"
test -n "$IFACE"

sudo tee /etc/netplan/60-floating-ip.yaml >/dev/null <<EOF
network:
  version: 2
  ethernets:
    $IFACE:
      addresses:
        - $FIP/32
EOF
sudo chmod 600 /etc/netplan/60-floating-ip.yaml
sudo netplan apply

ip -4 addr show dev "$IFACE" | grep -qF "inet $FIP/"
echo "  $FIP active on $IFACE"
REMOTE
}

# Apache with the modules and a named virtual host on port 80. Needs neither
# the database nor the domain, so it is done while the old VM still serves.
prepare_web() {
    log "Setting up Apache for $DOMAIN (HTTP only, HTTPS follows after the switch)"
    ssh_vm bash -s -- "$DOMAIN" <<'REMOTE'
set -euo pipefail
DOMAIN="$1"

sudo a2enmod proxy proxy_http proxy_wstunnel ssl headers rewrite >/dev/null
# Silences "could not determine the server's fully qualified domain name".
printf 'ServerName %s\n' "$DOMAIN" | sudo tee /etc/apache2/conf-available/ocpp-servername.conf >/dev/null
sudo a2enconf ocpp-servername >/dev/null

sudo tee "/etc/apache2/sites-available/$DOMAIN.conf" >/dev/null <<EOF
<VirtualHost *:80>
    ServerName $DOMAIN
    DocumentRoot /var/www/html
</VirtualHost>
EOF
sudo a2dissite 000-default >/dev/null || true
sudo a2ensite "$DOMAIN" >/dev/null
sudo systemctl restart apache2
echo "  Apache ready"
REMOTE
}

# The Let's Encrypt certificate and the HTTPS virtual host of the application.
# Runs after the floating IP is on the VM, because validation connects to it.
# A restored certificate is reused instead of requesting a new one.
setup_ssl() {
    local restore=0
    if [ -n "$LE_ARCHIVE" ]; then
        restore=1
        log "Uploading the saved Let's Encrypt state $(basename "$LE_ARCHIVE")"
        scp "${SSH_OPTS[@]}" "$LE_ARCHIVE" "$SSH_USER@$SERVER_IP:/tmp/letsencrypt.tar.gz"
    fi

    log "Setting up Let's Encrypt and HTTPS for $DOMAIN"
    ssh_vm bash -s -- "$DOMAIN" "$LE_EMAIL" "$LE_STAGING" "$restore" <<'REMOTE'
set -euo pipefail
DOMAIN="$1"
EMAIL="$2"
STAGING="$3"
RESTORE="$4"

if [ "$RESTORE" = 1 ]; then
    sudo tar -xzpf /tmp/letsencrypt.tar.gz -C /
    sudo rm -f /tmp/letsencrypt.tar.gz
    echo "  restored /etc/letsencrypt"
fi

CERTBOT_ARGS=(--apache --non-interactive --agree-tos --email "$EMAIL" -d "$DOMAIN" --redirect)
if [ "$STAGING" = 1 ]; then
    CERTBOT_ARGS+=(--staging)
fi
sudo certbot "${CERTBOT_ARGS[@]}"

# Certbot wrote a plain HTTPS virtual host. Replace it with the one from the
# repo, the same configuration as on AWS: /ws to the station controller,
# /api to the cloud API, and the two UIs. It uses the same certificate paths.
SSL_CONF="/etc/apache2/sites-available/$DOMAIN-le-ssl.conf"
sed "s/apt\.aircokopen\.nu/$DOMAIN/g" /home/ubuntu/ocpp-server/infra/apt.aircokopen.nu-le-ssl.conf \
    | sudo tee "$SSL_CONF" >/dev/null
sudo a2ensite "$DOMAIN-le-ssl" >/dev/null
sudo apache2ctl configtest
sudo systemctl reload apache2
# Apache 2.4 lists vhosts as "*:443  <name> (file:line)". Older releases wrote
# "port 443 namevhost <name>", so both forms are accepted.
VHOSTS="$(sudo apache2ctl -S 2>&1 | grep -E '(^\*:443|port 443 namevhost)' | grep -cF "$DOMAIN" || true)"
if [ "$VHOSTS" != 1 ]; then
    echo "ERROR: expected one HTTPS virtual host for $DOMAIN, found $VHOSTS" >&2
    exit 1
fi
echo "  application virtual host active"

if systemctl is-enabled certbot.timer >/dev/null 2>&1; then
    echo "  automatic renewal is enabled (certbot.timer)"
else
    echo "WARNING: certbot.timer is not enabled, the certificate will not renew automatically" >&2
fi
if [ "$STAGING" != 1 ]; then
    if sudo certbot renew --dry-run >/dev/null 2>&1; then
        echo "  renewal dry run ok"
    else
        echo "WARNING: renewal dry run failed" >&2
    fi
fi
REMOTE
}

# A failed check keeps the old VMs (powered off) instead of deleting them.
check_failed() {
    echo "WARNING: $*" >&2
    VERIFY_FAILED=1
}

verify_floating_ip() {
    log "Checking SSH through the floating IP"
    local _
    for _ in 1 2 3 4 5 6; do
        if SSH_TARGET="$FIP_IP" ssh_vm "hostname" 2>/dev/null; then
            return
        fi
        sleep 10
    done
    check_failed "could not reach the VM through $FIP_IP yet. Check again in a minute."
}

verify_https() {
    log "Checking https://$DOMAIN"
    local args=(-sS -o /dev/null -w '%{http_code}' --max-time 20 --resolve "$DOMAIN:443:$FIP_IP")
    if [ "$LE_STAGING" = 1 ]; then
        args+=(-k)
    fi
    local _ code
    for _ in 1 2 3; do
        code="$(curl "${args[@]}" "https://$DOMAIN/" 2>/dev/null || true)"
        if [ "$code" = "200" ]; then
            echo "  HTTPS works (HTTP $code)"
            return
        fi
        sleep 5
    done
    check_failed "https://$DOMAIN did not answer with HTTP 200 (got: ${code:-no response})"
}

# Checks every part of the application through Apache, the way a browser or a
# charger reaches it.
verify_application() {
    log "Checking the application"
    local curl_args=(-sS --max-time 20 --resolve "$DOMAIN:443:$FIP_IP")
    if [ "$LE_STAGING" = 1 ]; then
        curl_args+=(-k)
    fi

    local path code
    for path in /management-ui/ /resident-ui/ /api/openapi.json; do
        code="$(curl "${curl_args[@]}" -o /dev/null -w '%{http_code}' "https://$DOMAIN$path" 2>/dev/null || true)"
        if [ "$code" = "200" ]; then
            echo "  $path ok"
        else
            check_failed "https://$DOMAIN$path answered HTTP ${code:-none}"
        fi
    done

    # A WebSocket handshake to the station controller. Connecting has no side
    # effects, the connection is dropped by the timeout.
    local status
    status="$(curl "${curl_args[@]}" -i --http1.1 --max-time 5 \
        -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
        -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
        -H 'Sec-WebSocket-Protocol: ocpp2.0.1, ocpp1.6' \
        "https://$DOMAIN/ws/deploy-healthcheck" 2>/dev/null | head -n 1 | tr -d '\r' || true)"
    if [[ "$status" == HTTP/1.1\ 101* ]]; then
        echo "  /ws (station controller) ok"
    else
        check_failed "the WebSocket handshake on /ws did not succeed (got: ${status:-no response})"
    fi

    if ! ssh_vm "systemctl is-active --quiet cloud-api ocpp"; then
        check_failed "cloud-api or ocpp is not active on the VM"
    fi
}

# Deletes the old VMs, but only when the new one passed every check.
finish_old_vms() {
    if [ "$OLD_COUNT" -eq 0 ]; then
        return
    fi
    if [ "$VERIFY_FAILED" = 0 ]; then
        delete_old_vms
        return
    fi
    echo >&2
    echo "Not every check passed, so the old VMs are kept, powered off:" >&2
    echo "  $(jq -r '[.[].name] | join(", ")' <<<"$OLD_SERVERS_JSON")" >&2
    if [ -n "$OLD_ACTIVE_ID" ]; then
        echo "To go back: power on $OLD_ACTIVE_NAME and assign the floating IP to it in the Hetzner console." >&2
    fi
    echo "When the new VM works, delete them in the Hetzner console." >&2
}

main() {
    local arg
    for arg in "$@"; do
        case "$arg" in
            -y|--yes) ASSUME_YES=1 ;;
            -h|--help) echo "Usage: bash infra/deploy-hetzner.sh [--yes]"; return 0 ;;
            *) die "unknown argument: $arg (usage: bash infra/deploy-hetzner.sh [--yes])" ;;
        esac
    done

    require_tools
    load_from_env_file HCLOUD_TOKEN
    load_from_env_file LETSENCRYPT_EMAIL
    LE_EMAIL="${LETSENCRYPT_EMAIL:-}"

    [ -n "${HCLOUD_TOKEN:-}" ] || die "HCLOUD_TOKEN is not set. Add it to $ENV_FILE or export it (Hetzner console > Security > API tokens, read + write)"
    [[ "$LE_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] \
        || die "LETSENCRYPT_EMAIL is not set. Add LETSENCRYPT_EMAIL=you@example.com to $ENV_FILE or export it"
    [[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || die "invalid domain: $DOMAIN"
    [[ "$LE_STAGING" =~ ^[01]$ ]] || die "OCPP_LE_STAGING must be 0 or 1"
    local version
    for version in "$PYTHON_VERSION" "$NODE_VERSION" "$FLYWAY_VERSION"; do
        [[ "$version" =~ ^[0-9]+(\.[0-9]+)*$ ]] || die "invalid version number: $version"
    done

    trap cleanup EXIT
    ensure_secrets
    # Everything that can fail without touching Hetzner happens first.
    prepare_application

    KNOWN_HOSTS="$(mktemp)"
    # Every VM has new host keys. Trust the one we just created, but only for this run.
    # The keepalive stops long silent steps (npm, pip) from dropping the connection.
    SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o LogLevel=ERROR
        -o ServerAliveInterval=30 -o ServerAliveCountMax=20
        -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$KNOWN_HOSTS")

    # 1. Checks, nothing is changed yet.
    ensure_ssh_key
    ensure_floating_ip
    check_dns
    find_old_vms
    if [ -z "$OLD_ACTIVE_ID" ]; then
        find_latest_backup
        find_latest_le_archive
    fi
    confirm_plan

    # 2. The new VM with the software, while the old one keeps serving.
    create_server
    wait_for_server
    wait_for_ssh
    install_application
    prepare_web

    # 3. Take over: the newest data from the old VM, then shut it down.
    if [ -n "$OLD_ACTIVE_ID" ]; then
        stop_old_services
        backup_old_vm
    fi
    if [ "$OLD_COUNT" -gt 0 ]; then
        shutdown_old_vms
    fi

    # 4. Finalize the new VM, then delete the old ones.
    import_backup
    start_application
    assign_floating_ip
    configure_floating_ip_on_vm
    setup_ssl
    verify_floating_ip
    verify_https
    verify_application
    finish_old_vms

    echo
    if [ "$VERIFY_FAILED" = 0 ]; then
        echo "Done."
    else
        echo "Done, but not every check passed (see the warnings above)."
    fi
    if [ -n "$DOWNTIME_START" ]; then
        echo "  Downtime:    about $((SECONDS - DOWNTIME_START)) seconds (from stopping the old services to the end of the checks)"
    fi
    echo "  VM:          $SERVER_NAME (id $SERVER_ID, $SERVER_IP)"
    echo "  Floating IP: $FIP_IP ($FIP_LOCATION)"
    echo "  Website:     https://$DOMAIN"
    echo "  Management:  https://$DOMAIN/management-ui/"
    echo "  Residents:   https://$DOMAIN/resident-ui/"
    echo "  Chargers:    wss://$DOMAIN/ws/<station id>"
    echo "  Database:    $REMOTE_DATA_DIR/cloud.db (from $(basename "$LATEST_BACKUP"))"
    echo
    echo "SSH: ssh -i $SSH_KEY $SSH_USER@$FIP_IP"
}

# Allows sourcing this file in tests without running it.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
