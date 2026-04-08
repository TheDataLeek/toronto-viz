#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/TheDataLeek/toronto-viz.git"
INSTALL_DIR="/opt/toronto-viz"
SERVICE_NAME="toronto-viz"
# If invoked via sudo, SUDO_USER is the real caller; fall back to whoami
SERVICE_USER=${SUDO_USER:-$(whoami)}
SERVICE_HOME=$(getent passwd "$SERVICE_USER" | cut -d: -f6)

log() { echo "[$(date '+%H:%M:%S')] $*"; }

log "Starting toronto-viz install"
log "  repo:    $REPO"
log "  target:  $INSTALL_DIR"
log "  service: $SERVICE_NAME"
log "  user:    $SERVICE_USER (home: $SERVICE_HOME)"

# Install uv — system-wide when running as root so the service user can find it,
# otherwise per-user into ~/.local/bin
if ! command -v uv &>/dev/null; then
    log "uv not found — installing..."
    if [ "$(id -u)" = "0" ]; then
        curl -LsSf https://astral.sh/uv/install.sh | UV_INSTALL_DIR=/usr/local/bin sh
    else
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$PATH"
    fi
    log "uv installed: $(uv --version)"
else
    log "uv already installed: $(uv --version)"
fi

# Clone or update the repo as the service user so it owns the files
if [ -d "$INSTALL_DIR/.git" ]; then
    log "Repo exists — pulling latest..."
    BEFORE=$(sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" rev-parse --short HEAD)
    sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" pull --ff-only
    AFTER=$(sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" rev-parse --short HEAD)
    if [ "$BEFORE" = "$AFTER" ]; then
        log "Already up to date ($AFTER)"
    else
        log "Updated $BEFORE → $AFTER"
    fi
else
    log "Cloning repo to $INSTALL_DIR..."
    mkdir -p "$INSTALL_DIR"
    chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
    sudo -u "$SERVICE_USER" git clone "$REPO" "$INSTALL_DIR"
    log "Cloned at $(sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" rev-parse --short HEAD)"
fi

chmod +x "$INSTALL_DIR/deploy/run.sh"

# Sync production dependencies as the service user
log "Syncing dependencies (no-dev)..."
sudo -u "$SERVICE_USER" uv sync --no-dev --project "$INSTALL_DIR"
log "Dependencies synced"

# Write the service unit with the real username substituted in
log "Installing systemd service unit (User=$SERVICE_USER)..."
sed "s/__SERVICE_USER__/$SERVICE_USER/" "$INSTALL_DIR/deploy/$SERVICE_NAME.service" \
    | tee "/etc/systemd/system/$SERVICE_NAME.service" > /dev/null
systemctl daemon-reload
log "Enabling $SERVICE_NAME..."
systemctl enable "$SERVICE_NAME"
log "Restarting $SERVICE_NAME..."
systemctl restart "$SERVICE_NAME"

log "Install complete. Service status:"
systemctl status "$SERVICE_NAME" --no-pager
