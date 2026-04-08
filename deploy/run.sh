#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/toronto-viz"
UV_BIN="$HOME/.local/bin/uv"

cd "$INSTALL_DIR"

# Pull latest code before starting
git pull --ff-only

# Sync production dependencies
"$UV_BIN" sync --no-dev --project "$INSTALL_DIR"

# Hand off to the app
exec "$UV_BIN" run python "$INSTALL_DIR/main.py" --host 0.0.0.0 --port 5000
