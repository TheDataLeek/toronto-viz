#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/toronto-viz"
export PATH="/usr/local/bin:$HOME/.local/bin:$PATH"

cd "$INSTALL_DIR"

# Pull latest code before starting
git pull --ff-only

# Sync production dependencies
uv sync --no-dev --project "$INSTALL_DIR"

# Hand off to the app
exec uv run python "$INSTALL_DIR/main.py" --host 0.0.0.0 --port 5000
