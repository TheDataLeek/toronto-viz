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

On the Pi, run the bootstrap installer once:

```sh
curl -LsSf https://raw.githubusercontent.com/TheDataLeek/toronto-viz/main/deploy/install.sh | bash
```

This clones the repo to `/opt/toronto-viz`, installs the systemd service, and starts it. The script is idempotent — re-run it to pull updates.

To deploy changes from your dev machine:

```sh
just install        # copy service file, reload systemd, restart
just logs           # tail journald logs
```

### Finding the Pi on your network

```sh
just pingscan       # scans local subnet with nmap, highlights Pi candidates
```

Requires `nmap`. MAC vendor detection may need `sudo` on Linux.
