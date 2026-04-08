lint:
    uv run ruff check .
    uv run ty check .

format:
    uv run ruff format .

fetch-sample:
    uv run python ./main.py fetch_sample

test target='tests/':
    uv run pytest {{ target }}

serve:
    uv run python ./main.py

install:
    sudo cp deploy/toronto-viz.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable toronto-viz
    sudo systemctl restart toronto-viz

logs:
    journalctl -u toronto-viz -f

pingscan:
    uv run python ./main.py pingscan