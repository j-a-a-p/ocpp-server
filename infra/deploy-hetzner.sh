#!/bin/bash

# Create a Hetzner Cloud VM for the OCPP server, put a floating IP on it and
# import the latest database backup (backups/cloud-*.db, see backup-database.sh).
#
# - The floating IP is created only once; later runs reuse it.
# - Every run creates a NEW VM and moves the floating IP to it. Old VMs are
#   never deleted; they are listed at the end so you can remove them yourself.
# - Create your DNS A record for the floating IP address printed at the end.
#
# This does not deploy the applications yet, only the VM, the IP and the data.
#
# Requirements: bash, curl, jq, ssh, scp, ssh-keygen
#
# Environment:
#   HCLOUD_TOKEN           required, Hetzner Cloud API token (read + write)
#   HCLOUD_LOCATION        default fsn1; only used when the floating IP is
#                          created. An existing floating IP keeps its location
#                          and the VM is created there.
#   HCLOUD_SERVER_TYPE     default cx23
#   HCLOUD_IMAGE           default ubuntu-24.04
#   OCPP_FLOATING_IP_NAME  default ocpp-server
#   OCPP_DEPLOY_SSH_KEY    default ~/.ssh/ocpp-hetzner-deploy (generated when
#                          missing, the private key never enters this repo)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$REPO_ROOT/backups"

API_URL="${HCLOUD_API_URL:-https://api.hetzner.cloud/v1}"
LOCATION="${HCLOUD_LOCATION:-fsn1}"
SERVER_TYPE="${HCLOUD_SERVER_TYPE:-cx23}"
IMAGE="${HCLOUD_IMAGE:-ubuntu-24.04}"
FIP_NAME="${OCPP_FLOATING_IP_NAME:-ocpp-server}"
SSH_KEY="${OCPP_DEPLOY_SSH_KEY:-$HOME/.ssh/ocpp-hetzner-deploy}"

SSH_USER="ubuntu"
APP_LABEL="ocpp-server"
REMOTE_DATA_DIR="/home/ubuntu/ocpp-data"

KNOWN_HOSTS=""
SERVER_ID=""
SERVER_NAME=""
SERVER_IP=""
SSH_KEY_ID=""
FIP_ID=""
FIP_IP=""
FIP_LOCATION=""
FIP_SERVER=""
LATEST_BACKUP=""

log() {
    echo "==> $*"
}

die() {
    echo "ERROR: $*" >&2
    exit 1
}

cleanup() {
    local code=$?
    [ -n "$KNOWN_HOSTS" ] && rm -f "$KNOWN_HOSTS"
    if [ "$code" -ne 0 ] && [ -n "$SERVER_ID" ]; then
        echo >&2
        echo "The deployment did not finish, but VM '$SERVER_NAME' (id $SERVER_ID) was created." >&2
        echo "Inspect it, or delete it in the Hetzner console. The floating IP may already point to it." >&2
    fi
}

require_tools() {
    local tool
    for tool in curl jq ssh scp ssh-keygen; do
        command -v "$tool" >/dev/null 2>&1 || die "'$tool' is required but not installed"
    done
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

find_latest_backup() {
    local files=()
    shopt -s nullglob
    files=("$BACKUP_DIR"/cloud-*.db)
    shopt -u nullglob
    if [ "${#files[@]}" -eq 0 ]; then
        die "no backup found in $BACKUP_DIR - run infra/backup-database.sh first"
    fi
    # Names contain a YYYYMMDD-HHMMSS timestamp, so the last one is the newest.
    LATEST_BACKUP="${files[${#files[@]}-1]}"
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
  - sqlite3
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

ssh_vm() {
    ssh "${SSH_OPTS[@]}" -T "$SSH_USER@${SSH_TARGET:-$SERVER_IP}" "$@"
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
    ssh_vm "command -v python3 >/dev/null" || die "python3 missing on the VM, cloud-init did not finish properly"
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

assign_floating_ip() {
    if [ -n "$FIP_SERVER" ] && [ "$FIP_SERVER" != "$SERVER_ID" ]; then
        echo "NOTE: floating IP $FIP_IP currently points to server $FIP_SERVER and will be moved to $SERVER_NAME."
    fi
    log "Assigning floating IP $FIP_IP to $SERVER_NAME"
    hcloud_api POST "/floating_ips/$FIP_ID/actions/assign" \
        "$(jq -n --argjson server "$SERVER_ID" '{server: $server}')" >/dev/null

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

verify_floating_ip() {
    log "Checking SSH through the floating IP"
    local _
    for _ in 1 2 3 4 5 6; do
        if SSH_TARGET="$FIP_IP" ssh_vm "hostname" 2>/dev/null; then
            return
        fi
        sleep 10
    done
    echo "WARNING: could not reach the VM through $FIP_IP yet. Check again in a minute." >&2
}

list_other_vms() {
    local response others
    response="$(hcloud_api GET "/servers?label_selector=app%3D$APP_LABEL&per_page=50")"
    others="$(jq -r --argjson id "$SERVER_ID" \
        '.servers[] | select(.id != $id) | "  \(.name) (id \(.id), \(.status))"' <<<"$response")"
    if [ -n "$others" ]; then
        echo
        echo "Earlier VMs with label app=$APP_LABEL (not deleted, remove them if unused):"
        echo "$others"
    fi
}

main() {
    require_tools
    [ -n "${HCLOUD_TOKEN:-}" ] || die "HCLOUD_TOKEN is not set (Hetzner console > Security > API tokens, read + write)"
    find_latest_backup

    trap cleanup EXIT
    KNOWN_HOSTS="$(mktemp)"
    # Every VM has new host keys. Trust the one we just created, but only for this run.
    SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o LogLevel=ERROR
        -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$KNOWN_HOSTS")

    ensure_ssh_key
    ensure_floating_ip
    create_server
    wait_for_server
    wait_for_ssh
    import_backup
    assign_floating_ip
    configure_floating_ip_on_vm
    verify_floating_ip

    echo
    echo "Done."
    echo "  VM:          $SERVER_NAME (id $SERVER_ID, $SERVER_IP)"
    echo "  Floating IP: $FIP_IP ($FIP_LOCATION)"
    echo "  Database:    $REMOTE_DATA_DIR/cloud.db (from $(basename "$LATEST_BACKUP"))"
    echo
    echo "Create a DNS A record pointing to $FIP_IP"
    echo "SSH: ssh -i $SSH_KEY $SSH_USER@$FIP_IP"
    list_other_vms
}

# Allows sourcing this file in tests without running it.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
