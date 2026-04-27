# toronto-viz

Scrapes TTC vehicle locations every 60 seconds and serves them via a FastAPI app. Also fetches TTC GTFS static data (stops, route shapes) from Toronto Open Data every 24 hours. A canvas-based map frontend (D3.js, hosted on GitHub Pages) polls the API and renders live vehicle positions.

## How it works

- **Scraper** polls the [UmoiQ public JSON feed](https://retro.umoiq.com/service/publicJSONFeed?command=vehicleLocations&a=ttc&t=0) every 60 seconds
- **Routes** — fetches TTC GTFS zip from Toronto Open Data every 24h, loading stops and shapes into DuckDB with spatial geometry
- **Dedup** — within-batch (`SELECT DISTINCT`) and cross-run (`NOT EXISTS` on vehicle ID + lat + lon)
- **Storage** — DuckDB at `data/backend.db` with the DuckDB spatial extension
- **API** — FastAPI serves GeoJSON endpoints (all rate-limited at 30 req/min):
  - `GET /api/data` — latest vehicle locations (past 60s, one row per vehicle)
  - `GET /api/paths` — vehicle paths as LineStrings (default: past 5 min)
  - `GET /api/stops` — TTC stop locations
  - `GET /api/routes` — TTC route shapes

## Requirements

- [uv](https://docs.astral.sh/uv/)
- [just](https://github.com/casey/just)
- Node.js + npm (for frontend build)

## Local development

```sh
# Backend
just serve          # run scraper + API at 127.0.0.1:5000
just test           # run tests
just lint           # ruff + ty
just format         # ruff format
just fetch-sample   # save a live API snapshot to data/sample_data.json

# Frontend
just dev            # livereload dev server at localhost:3000
just render         # production build → dist/index.html + dist/bundle.js + dist/styles.css
```

The `tests/test_scraper.py` suite uses in-memory DuckDB. `test_db_write` requires `data/sample_data.json` — generate it with `just fetch-sample` first.

## Frontend

The map is a vanilla JS + D3.js canvas app in `src/`. It prefetches route shapes and stops on load, then polls `/api/paths` every 30 seconds to update vehicle positions. The Liquid template (`templates/index.html.liquid`) is rendered into `dist/index.html` with the correct API URL injected at build time. The `dist/` directory is what GitHub Pages serves.

## Docker deployment

The backend is published to `ghcr.io/thedataleek/toronto-viz:latest` on every push to `main`.

```sh
docker compose up -d
```

The `docker-compose.yml` in the repo root is all you need. It pulls the pre-built image and mounts a named volume at `/app/data` to persist the DuckDB database across updates. The API is available at `http://localhost:5000`.

To update to the latest image:

```sh
docker compose pull && docker compose up -d
```

The container runs the backup script at startup and every 24 hours; backups land in the same volume at `/app/data/backups/`.

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
