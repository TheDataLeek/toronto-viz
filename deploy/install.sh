#!/usr/bin/env bash
set -euo pipefail

REPO="https://github.com/TheDataLeek/toronto-viz.git"
INSTALL_DIR="/opt/toronto-viz"
SERVICE_NAME="toronto-viz"

# Install uv if not present
if ! command -v uv &>/dev/null; then
    echo "Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
fi

# Clone or update the repo
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "Updating repo..."
    git -C "$INSTALL_DIR" pull
else
    echo "Cloning repo to $INSTALL_DIR..."
    sudo git clone "$REPO" "$INSTALL_DIR"
    sudo chown -R pi:pi "$INSTALL_DIR"
fi

# Sync production dependencies
echo "Syncing dependencies..."
uv sync --no-dev --project "$INSTALL_DIR"

# Install and enable the systemd service
echo "Installing systemd service..."
sudo cp "$INSTALL_DIR/deploy/$SERVICE_NAME.service" "/etc/systemd/system/$SERVICE_NAME.service"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo "Done. Service status:"
systemctl status "$SERVICE_NAME" --no-pager
