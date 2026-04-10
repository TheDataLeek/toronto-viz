#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="/opt/toronto-viz"
export PATH="/usr/local/bin:$HOME/.local/bin:$PATH"

cd "$INSTALL_DIR"

# Pull latest code before starting
git pull --ff-only

# Sync production dependencies
uv sync --no-dev --project "$INSTALL_DIR"

# Start scraper as a background process (killed by systemd cgroup on service stop)
uv run python -m vizlib.scraper &

# Hand off to gunicorn
exec uv run gunicorn --config "$INSTALL_DIR/deploy/gunicorn.conf.py" "vizlib.server:app"
