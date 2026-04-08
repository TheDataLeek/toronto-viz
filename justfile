# Run ruff and ty static analysis checks
lint:
    uv run ruff check .
    uv run ty check .

# Auto-format source files with ruff
format:
    uv run ruff format .

# Pull a live API snapshot to data/sample_data.json
fetch-sample:
    uv run python ./main.py fetch_sample

# Run tests (pass target= to run a single file or test)
test target='tests/':
    uv run pytest {{ target }}

# Start the scraper and Flask server locally on 127.0.0.1:5000
serve:
    uv run python ./main.py

# Install and start the systemd service on the Raspberry Pi
install:
    sudo cp deploy/toronto-viz.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable toronto-viz
    sudo systemctl restart toronto-viz

# Tail live journald logs for the toronto-viz service
logs:
    journalctl -u toronto-viz -f

# Scan the local network to find the Raspberry Pi's IP address
pingscan:
    uv run python ./main.py pingscan

# Deploy to Raspberry Pi via SSH (auto-discovers IP with pingscan)
deploy:
    #!/usr/bin/env bash
    set -euo pipefail
    IP=$(uv run python ./main.py pingscan --ip-only)
    echo "Deploying to zoe@$IP ..."
    ssh zoe@"$IP" "cd /opt/toronto-viz && sudo bash deploy/install.sh"