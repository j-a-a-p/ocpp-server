#!/bin/bash

# Download a consistent snapshot of the production SQLite database
# into backups/ at the repo root.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SSH_KEY_SRC="$REPO_ROOT/../ChargeAPT.pem"
SSH_USER="ubuntu"
SSH_HOST="apt.aircokopen.nu"
REMOTE_BACKUP="/tmp/cloud-backup.db"
LOCAL_BACKUP_DIR="$REPO_ROOT/backups"

if [ ! -f "$SSH_KEY_SRC" ]; then
    echo "ERROR: SSH key file '$SSH_KEY_SRC' not found"
    echo "Expected ChargeAPT.pem one directory above this repo"
    exit 1
fi

echo "Found SSH key: $SSH_KEY_SRC"

# Files on a Windows drive (/mnt/c under WSL) cannot get Unix permissions,
# so SSH rejects the key. Work on a private copy with mode 600 instead.
SSH_KEY="$(mktemp)"
cp "$SSH_KEY_SRC" "$SSH_KEY"
chmod 600 "$SSH_KEY"

# Trust the server's host key on first connect and save it to known_hosts.
# A later change to the key is still rejected.
SSH_OPTS=(-i "$SSH_KEY" -o ConnectTimeout=10 -o BatchMode=yes -o StrictHostKeyChecking=accept-new)

cleanup() {
    ssh "${SSH_OPTS[@]}" -T "$SSH_USER@$SSH_HOST" \
        "rm -f '$REMOTE_BACKUP'" 2>/dev/null || true
    rm -f "$SSH_KEY"
}
trap cleanup EXIT

echo "Target server: $SSH_USER@$SSH_HOST"
echo "Testing SSH connection..."
if ! ssh "${SSH_OPTS[@]}" -T "$SSH_USER@$SSH_HOST" "echo 'SSH connection successful'"; then
    echo "ERROR: SSH connection failed. See the SSH error above."
    echo "Check that the server address is correct, the key has correct permissions (600),"
    echo "and the server allows SSH key authentication."
    exit 1
fi

echo "SSH connection successful"

echo "Creating database snapshot on server..."
ssh "${SSH_OPTS[@]}" -T "$SSH_USER@$SSH_HOST" "python3 -" << 'PY'
import os
import sqlite3
import sys

src_path = "/home/ubuntu/ocpp-data/cloud.db"
dst_path = "/tmp/cloud-backup.db"

if not os.path.isfile(src_path):
    print(f"ERROR: database not found: {src_path}", file=sys.stderr)
    sys.exit(1)

if os.path.exists(dst_path):
    os.remove(dst_path)

src = sqlite3.connect(src_path)
dst = sqlite3.connect(dst_path)
with dst:
    src.backup(dst)
src.close()
dst.close()

check = sqlite3.connect(dst_path)
row = check.execute("PRAGMA integrity_check").fetchone()
check.close()
status = row[0] if row else "no result"
if status != "ok":
    print(f"ERROR: integrity check failed: {status}", file=sys.stderr)
    sys.exit(1)
print("integrity_check ok")
PY

STAMP="$(date +%Y%m%d-%H%M%S)"
LOCAL_FILE="$LOCAL_BACKUP_DIR/cloud-$STAMP.db"
mkdir -p "$LOCAL_BACKUP_DIR"

echo "Downloading snapshot..."
scp "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST:$REMOTE_BACKUP" "$LOCAL_FILE"

echo "Backup saved to $LOCAL_FILE"
