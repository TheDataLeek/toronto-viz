#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/toronto-viz"
export PATH="/usr/local/bin:$HOME/.local/bin:$PATH"

cd "$INSTALL_DIR"

# Pull latest code before starting
git pull --ff-only

# Sync production dependencies
uv sync --no-dev --project "$INSTALL_DIR"

# Backup DB at startup, then every 24 h in background
uv run "$INSTALL_DIR/deploy/backup.py"
(while true; do sleep 86400; uv run "$INSTALL_DIR/deploy/backup.py"; done) &

# Hand off to gunicorn
exec uv run gunicorn --config "$INSTALL_DIR/deploy/gunicorn.conf.py" "vizlib.server:app"
