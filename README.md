# toronto-viz

Scrapes TTC vehicle locations every 60 seconds and serves them via a Flask API. Designed to run on a Raspberry Pi as a systemd service.

## How it works

- **Scraper** polls the [UmoiQ public JSON feed](https://retro.umoiq.com/service/publicJSONFeed?command=vehicleLocations&a=ttc&t=0) every 60 seconds
- **Dedup** — within-batch (`SELECT DISTINCT`) and cross-run (`NOT EXISTS` on vehicle ID + API timestamp)
- **Storage** — DuckDB at `data/backend.db`
- **API** — Flask serves `GET /api/data` returning all rows as JSON

## Requirements

- [uv](https://docs.astral.sh/uv/)
- [just](https://github.com/casey/just)

## Local development

```sh
just serve          # run scraper + API at 127.0.0.1:5000
just test           # run tests
just lint           # ruff + ty
just format         # ruff format
just fetch-sample   # save a live API snapshot to data/sample_data.json
```

The `tests/test_scraper.py` suite uses in-memory DuckDB. `test_db_write` requires `data/sample_data.json` — generate it with `just fetch-sample` first.

## Raspberry Pi deployment

### First-time setup

SSH into the Pi and run the bootstrap installer:

```sh
curl -LsSf https://raw.githubusercontent.com/TheDataLeek/toronto-viz/main/deploy/install.py | sudo uv run -
```

Or clone the repo manually and run:

```sh
sudo uv run deploy/install.py
```

This clones the repo to `/opt/toronto-viz`, installs the systemd service as the calling user, and starts it. On every subsequent service start, `deploy/run.sh` automatically pulls the latest code and resyncs dependencies before launching the app — so the service is always self-updating.

### Deploying from your dev machine

```sh
just deploy         # pingscan for Pi IP, then SSH + run installer
just logs           # tail journald logs
```

### Finding the Pi on your network

```sh
just pingscan       # scans local subnet with nmap, highlights Pi candidates
```

Requires `nmap`. MAC vendor detection may need `sudo` on Linux.
