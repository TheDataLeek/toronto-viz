#!/usr/bin/env bash
set -euo pipefail

uv run /app/deploy/backup.py
(while true; do sleep 86400; uv run /app/deploy/backup.py; done) &

exec uv run gunicorn --config /app/deploy/gunicorn.conf.py vizlib.server:app
