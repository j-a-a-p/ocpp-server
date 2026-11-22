#!/bin/bash

# Installs the OCPP server on this machine the way the AWS server is set up:
# Flyway, a Python virtualenv, the cloud API and the station controller as systemd
# services, both UIs built with Node and served by Apache, and a firewall.
#
# Run as the ubuntu user (it uses sudo) from the repository in /home/ubuntu/ocpp-server.
# infra/deploy-hetzner.sh uploads the repository and the rendered configuration to
# /tmp/configuration.ini, then runs this script. Safe to run again.
#
# Apache's HTTPS virtual host is not set up here, it needs the Let's Encrypt
# certificate, which deploy-hetzner.sh requests once the domain points to this machine.
#
# Settings (environment): FLYWAY_VERSION, NODE_VERSION, PYTHON_VERSION

set -euo pipefail

FLYWAY_VERSION="${FLYWAY_VERSION:-11.10.4}"
NODE_VERSION="${NODE_VERSION:-22.12.0}"
PYTHON_VERSION="${PYTHON_VERSION:-3.12}"

HOME_DIR="/home/ubuntu"
REPO_DIR="$HOME_DIR/ocpp-server"
VENV="$HOME_DIR/myenv"
DATA_DIR="$HOME_DIR/ocpp-data"
WEB_ROOT="/var/www/html"
CONFIG_SRC="/tmp/configuration.ini"
WORK_DIR="$(mktemp -d)"

trap 'rm -rf "$WORK_DIR"' EXIT

step() {
    echo "  -- $*"
}

die() {
    echo "ERROR: $*" >&2
    exit 1
}

check_prerequisites() {
    [ "$(uname -m)" = "x86_64" ] || die "only x86_64 machines are supported (Flyway download)"
    [ -d "$REPO_DIR/cloud-api" ] || die "$REPO_DIR is missing, upload the repository first"
    [ -f "$CONFIG_SRC" ] || die "$CONFIG_SRC is missing, the deploy script has to render it"
    # Without this Flyway would silently create an empty database.
    [ -f "$DATA_DIR/cloud.db" ] || die "$DATA_DIR/cloud.db is missing, import a backup first"
}

install_firewall() {
    step "Firewall: only SSH, HTTP and HTTPS are reachable"
    sudo ufw allow 22/tcp >/dev/null
    sudo ufw allow 80/tcp >/dev/null
    sudo ufw allow 443/tcp >/dev/null
    sudo ufw default deny incoming >/dev/null
    sudo ufw default allow outgoing >/dev/null
    sudo ufw --force enable >/dev/null
}

install_config() {
    step "Configuration: /etc/ocpp-server/configuration.ini"
    sudo mkdir -p /etc/ocpp-server
    sudo chown ubuntu:ubuntu /etc/ocpp-server
    sudo install -o ubuntu -g ubuntu -m 600 "$CONFIG_SRC" /etc/ocpp-server/configuration.ini
    rm -f "$CONFIG_SRC"
}

install_flyway() {
    local installed
    installed="$(flyway -v 2>&1 || true)"
    if [ -x /usr/local/bin/flyway ] && grep -q "$FLYWAY_VERSION" <<<"$installed"; then
        step "Flyway $FLYWAY_VERSION already installed"
        return
    fi
    step "Flyway $FLYWAY_VERSION"
    # The Linux archive bundles its own Java runtime.
    curl -fsSL "https://download.red-gate.com/maven/release/com/redgate/flyway/flyway-commandline/$FLYWAY_VERSION/flyway-commandline-$FLYWAY_VERSION-linux-x64.tar.gz" \
        | tar -xz -C "$HOME_DIR"
    sudo ln -sfn "$HOME_DIR/flyway-$FLYWAY_VERSION/flyway" /usr/local/bin/flyway
}

# The AWS server runs Python 3.12. The OS image may ship another version, and the
# pinned packages are not guaranteed to install there, so the environment gets its
# own interpreter through uv.
install_python_env() {
    local current=""
    if [ -x "$VENV/bin/python" ]; then
        current="$("$VENV/bin/python" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
    fi
    if [ "$current" != "$PYTHON_VERSION" ]; then
        step "Python $PYTHON_VERSION environment in $VENV"
        python3 -m venv "$WORK_DIR/uv-bootstrap"
        "$WORK_DIR/uv-bootstrap/bin/pip" install --quiet uv
        rm -rf "$VENV"
        "$WORK_DIR/uv-bootstrap/bin/uv" venv --quiet --python "$PYTHON_VERSION" "$VENV"
    else
        step "Python $PYTHON_VERSION environment already exists"
    fi

    step "Python packages (cloud-api and station-controller requirements)"
    if [ ! -x "$WORK_DIR/uv-bootstrap/bin/uv" ]; then
        python3 -m venv "$WORK_DIR/uv-bootstrap"
        "$WORK_DIR/uv-bootstrap/bin/pip" install --quiet uv
    fi
    "$WORK_DIR/uv-bootstrap/bin/uv" pip install --quiet --python "$VENV/bin/python" \
        -r "$REPO_DIR/cloud-api/requirements.txt" \
        -r "$REPO_DIR/station-controller/requirements.txt"
}

install_web_files() {
    step "Web root: dashboard page and meter value files"
    sudo install -o root -g root -m 644 "$REPO_DIR/infra/web/index.html" "$WEB_ROOT/index.html"
    sudo install -o root -g root -m 644 "$REPO_DIR/infra/web/favicon.svg" "$WEB_ROOT/favicon.svg"
    sudo install -o ubuntu -g www-data -m 644 "$REPO_DIR/infra/web/.htaccess" "$WEB_ROOT/.htaccess"
    # The station controller writes these two files as the ubuntu user.
    local file
    for file in meter_values.csv meter_values.json; do
        sudo touch "$WEB_ROOT/$file"
        sudo chown ubuntu:www-data "$WEB_ROOT/$file"
        sudo chmod 644 "$WEB_ROOT/$file"
    done
}

# Builds both UIs with an official Node release (checksum verified), which is only
# used for the build and removed afterwards.
build_uis() {
    local dist="node-v$NODE_VERSION-linux-x64"
    local base="https://nodejs.org/dist/v$NODE_VERSION"
    step "Node $NODE_VERSION (build only)"
    (
        cd "$WORK_DIR"
        curl -fsSLO "$base/$dist.tar.xz"
        curl -fsSLO "$base/SHASUMS256.txt"
        grep " $dist.tar.xz\$" SHASUMS256.txt | sha256sum -c - >/dev/null
        tar -xJf "$dist.tar.xz"
    )
    export PATH="$WORK_DIR/$dist/bin:$PATH"

    local ui
    for ui in management-ui resident-ui; do
        step "Building $ui"
        (
            cd "$REPO_DIR/$ui"
            npm ci --no-audit --no-fund --loglevel=error
            npm run build --silent
        )
        sudo mkdir -p "$WEB_ROOT/$ui"
        sudo find "$WEB_ROOT/$ui" -mindepth 1 -delete
        sudo cp -r "$REPO_DIR/$ui/dist/." "$WEB_ROOT/$ui/"
        sudo chown -R ubuntu:www-data "$WEB_ROOT/$ui"
        sudo chmod -R u=rwX,go=rX "$WEB_ROOT/$ui"
        # The old deploy-*-ui.sh scripts upload to these links.
        ln -sfn "$WEB_ROOT/$ui" "$HOME_DIR/$ui"
        rm -rf "$REPO_DIR/$ui/node_modules" "$REPO_DIR/$ui/dist"
    done
}

install_services() {
    step "systemd services: cloud-api and ocpp (station controller)"
    bash "$REPO_DIR/infra/create-cloud-api-service.sh" >/dev/null
    bash "$REPO_DIR/infra/create-ocpp-service.sh" >/dev/null

    # Both services append to a log file that grows without limit.
    sudo tee /etc/logrotate.d/ocpp-server >/dev/null <<'EOF'
/home/ubuntu/cloud-api.log /home/ubuntu/ocpp.log {
    weekly
    rotate 4
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable cloud-api.service ocpp.service >/dev/null 2>&1

    # The cloud API runs the Flyway migrations on start, the station controller
    # expects the tables to exist, so it goes second.
    sudo systemctl restart cloud-api.service
    local _
    for _ in $(seq 1 60); do
        if curl -fsS http://127.0.0.1:8000/openapi.json >/dev/null 2>&1; then
            break
        fi
        sleep 2
    done
    if ! curl -fsS http://127.0.0.1:8000/openapi.json >/dev/null 2>&1; then
        echo "--- last lines of /home/ubuntu/cloud-api.log" >&2
        tail -n 30 "$HOME_DIR/cloud-api.log" >&2 || true
        die "the cloud API did not come up on port 8000"
    fi
    step "cloud-api is answering on port 8000"

    sudo systemctl restart ocpp.service
    for _ in $(seq 1 30); do
        if ss -ltn | grep -q ':9000 '; then
            break
        fi
        sleep 1
    done
    if ! ss -ltn | grep -q ':9000 '; then
        echo "--- last lines of /home/ubuntu/ocpp.log" >&2
        tail -n 30 "$HOME_DIR/ocpp.log" >&2 || true
        die "the station controller is not listening on port 9000"
    fi
    step "ocpp (station controller) is listening on port 9000"
}

main() {
    check_prerequisites
    install_firewall
    install_config
    install_flyway
    install_python_env
    install_web_files
    build_uis
    install_services
    echo "  -- server installed"
}

main "$@"
