# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
# Backend
just serve          # run scraper + API at 127.0.0.1:5000
just test           # run all tests
just test tests/test_scraper.py::test_write_creates_table  # run a single test
just lint           # ruff check + ty check
just format         # ruff format
just fetch-sample   # pull a live API snapshot to data/sample_data.json

# Frontend
just dev            # start livereload dev server at localhost:3000 (watches src/, scss/, templates/)
just render         # render templates/index.html.liquid → dist/index.html (production build)

# Deployment
just install        # deploy to Raspberry Pi via systemd (run on Pi)
just deploy         # pingscan for Pi IP then SSH + run installer (run from dev machine)
just logs           # tail journald logs on Pi
```

Python dependencies: `uv add <pkg>` — never edit `pyproject.toml` directly.
JS dependencies: `npm install <pkg>` — managed via `package.json`.

## Architecture

This is a TTC (Toronto Transit Commission) vehicle location tracker. It scrapes the UmoiQ public JSON feed every 60 seconds and serves the data via a FastAPI app.

**Entry point** — `main.py` uses `cyclopts` for CLI. The default command starts both the scraper and FastAPI server (via uvicorn). `fetch_sample` saves a live API snapshot for use in tests.

**`vizlib/` package:**
- `__init__.py` — shared constants: `API_URL`, `DB_FILE` (`data/backend.db`), `SCRAPE_INTERVAL`, `SAMPLE_DATA_FILE`
- `server.py` — FastAPI app. Loguru intercepts uvicorn logs. Registers rate limiter, CORS (allows `thedataleek.github.io` and localhost:3000), security headers middleware. Starts `scraper_loop()` as an asyncio task via FastAPI lifespan. Docs/OpenAPI endpoints disabled.
- `routes.py` — `APIRouter` with all endpoints rate-limited at 30/minute: `GET /` (health), `GET /api/data` (latest vehicle locations), `GET /api/paths` (vehicle path lines, default 5 min window), `GET /api/stops`, `GET /api/routes`
- `scraper.py` — `scraper_loop()` async coroutine. Scrapes vehicle locations every 60s via `scrape_locations()`. Scrapes TTC GTFS static data (stops, shapes) from Toronto Open Data every 24h via `scrape_routes()`, storing raw CSVs as `ttc_*` tables then calling `build_derived_route_tables()`.
- `db.py` — singleton `get_write_conn()`, `query_database()` (returns Polars DataFrame, swallows `CatalogException`), `load_spatial()` (lazy-installs DuckDB spatial extension), `build_derived_route_tables()` (creates `stops` and `routes` tables with spatial geometry)
- `data.py` — query functions returning Polars DataFrames with a `geometry` column (ST_AsGeoJSON): `fetch_locations()`, `fetch_paths()`, `fetch_stops()`, `fetch_routes()`
- `util.py` — `to_geojson()` converts a Polars DataFrame with a `geometry` column to a GeoJSON FeatureCollection; `ensure_valid_session()` async context manager for aiohttp sessions

**Data flow:** UmoiQ JSON → `write_location_data()` → Polars DataFrame (adds `fetched_at`, `api_timestamp`) → DuckDB `vehicles` table. GTFS zip → `ttc_*` raw tables → `stops` + `routes` spatial tables.

**Dedup strategy:** within-batch (`SELECT DISTINCT`) + cross-run (`NOT EXISTS` on `id` + `lat` + `lon`). API timestamps are milliseconds — divide by 1000 before `datetime.fromtimestamp()`.

**Tests** (`tests/test_scraper.py`) use in-memory DuckDB via the `database_connection` parameter on `write_location_data()`. `test_db_write` requires `data/sample_data.json` (generate with `just fetch-sample`).

**Frontend** — Vanilla JS with D3.js, compiled with esbuild + Sass, hosted on GitHub Pages (`thedataleek.github.io`). Source lives in `src/` (JS modules) and `scss/` (Sass partials). `templates/index.html.liquid` is the page template, rendered to `dist/index.html` with `just render` (injects `api_url` and `script_src`). `just dev` runs a livereload server on port 3000 that watches all source files and rebuilds on change. The map (`src/map.js`) renders onto a `<canvas>` using D3 geoMercator projection and d3-zoom; it prefetches routes/stops/paths on load, then polls `/api/paths` every 30s. Stops are stride-thinned at low zoom levels to reduce canvas work. Production `api_url` points to the Pi via Tailscale (`snek.taila15010.ts.net`).

**Deployment** — Raspberry Pi running systemd service at `/opt/toronto-viz`. `deploy/install.py` is a standalone uv script (PEP 723 inline deps) that bootstraps or updates the install idempotently: clones/pulls the repo, syncs deps, and installs the service. Run via `sudo uv run deploy/install.py` or `just install` on the Pi. The service itself executes `deploy/run.sh`, which pulls latest code and resyncs deps on every start before exec-ing the app.
