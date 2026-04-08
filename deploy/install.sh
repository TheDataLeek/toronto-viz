#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/TheDataLeek/toronto-viz.git"
INSTALL_DIR="/opt/toronto-viz"
SERVICE_NAME="toronto-viz"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

log "Starting toronto-viz install"
log "  repo:    $REPO"
log "  target:  $INSTALL_DIR"
log "  service: $SERVICE_NAME"

# Install uv if not present
if ! command -v uv &>/dev/null; then
    log "uv not found — installing..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
    log "uv installed: $(uv --version)"
else
    log "uv already installed: $(uv --version)"
fi

# Clone or update the repo
if [ -d "$INSTALL_DIR/.git" ]; then
    log "Repo exists — pulling latest..."
    BEFORE=$(git -C "$INSTALL_DIR" rev-parse --short HEAD)
    git -C "$INSTALL_DIR" pull
    AFTER=$(git -C "$INSTALL_DIR" rev-parse --short HEAD)
    if [ "$BEFORE" = "$AFTER" ]; then
        log "Already up to date ($AFTER)"
    else
        log "Updated $BEFORE → $AFTER"
    fi
else
    log "Cloning repo to $INSTALL_DIR..."
    sudo mkdir -p "$INSTALL_DIR"
    sudo chown "$(id -u):$(id -g)" "$INSTALL_DIR"
    git clone "$REPO" "$INSTALL_DIR"
    log "Cloned at $(git -C "$INSTALL_DIR" rev-parse --short HEAD)"
fi

# Sync production dependencies
log "Syncing dependencies (no-dev)..."
uv sync --no-dev --project "$INSTALL_DIR"
log "Dependencies synced"

# Install and enable the systemd service
log "Installing systemd service unit..."
sudo cp "$INSTALL_DIR/deploy/$SERVICE_NAME.service" "/etc/systemd/system/$SERVICE_NAME.service"
sudo systemctl daemon-reload
log "Enabling $SERVICE_NAME..."
sudo systemctl enable "$SERVICE_NAME"
log "Restarting $SERVICE_NAME..."
sudo systemctl restart "$SERVICE_NAME"

log "Install complete. Service status:"
systemctl status "$SERVICE_NAME" --no-pager
