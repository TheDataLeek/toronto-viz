# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
just serve          # run the app locally (127.0.0.1:5000)
just test           # run all tests
just test tests/test_scraper.py::test_write_creates_table  # run a single test
just lint           # ruff check + ty check
just format         # ruff format
just fetch-sample   # pull a live API snapshot to data/sample_data.json
just install        # deploy to Raspberry Pi via systemd (run on Pi)
just logs           # tail journald logs on Pi
```

Dependencies: `uv add <pkg>` — never edit `pyproject.toml` directly.

## Architecture

This is a TTC (Toronto Transit Commission) vehicle location tracker. It scrapes the UmoiQ public JSON feed every 60 seconds and serves the data via a Flask API.

**Entry point** — `main.py` uses `cyclopts` for CLI. The default command starts both the scraper and Flask server. `fetch_sample` saves a live API snapshot for use in tests.

**`vizlib/` package:**
- `__init__.py` — shared constants: `API_URL`, `DB_FILE` (`data/backend.db`), `SCRAPE_INTERVAL`, `SAMPLE_DATA_FILE`
- `scraper.py` — `start_scraper()` launches a daemon thread running an asyncio loop. `write_data()` accepts the raw API JSON, builds a Polars DataFrame, registers it with DuckDB, and inserts with `NOT EXISTS` dedup (keyed on `vehicle.id` + `api_timestamp`)
- `server.py` — Flask app with loguru intercepting werkzeug logs. Exposes `GET /api/data` returning all rows from DuckDB as JSON

**Data flow:** API JSON → Polars DataFrame (adds `fetched_at`, `api_timestamp`) → DuckDB `vehicles` table in `data/backend.db`

**Dedup strategy:** within-batch (`SELECT DISTINCT`) + cross-run (`NOT EXISTS` on `id` + `api_timestamp`). API timestamps are milliseconds and must be divided by 1000 before `datetime.fromtimestamp()`.

**Tests** (`tests/test_scraper.py`) use in-memory DuckDB via the `database_connection` parameter on `write_data()`. `test_db_write` requires `data/sample_data.json` (generate with `just fetch-sample`).

**Deployment** — Raspberry Pi running systemd service at `/opt/toronto-viz`. `deploy/install.sh` is an idempotent bootstrap that clones/pulls the repo and installs the service. Flask is started with `--host 0.0.0.0` in production.
