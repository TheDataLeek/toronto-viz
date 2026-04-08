import asyncio
from typing import Any
import datetime
import threading

import aiohttp
import duckdb
import polars as pl
from loguru import logger

from . import API_URL, SCRAPE_INTERVAL, DB_FILE

TABLE_NAME = 'vehicles'

def start_scraper():
    thread = threading.Thread(target=_start_scraper, daemon=True, name="scraper")
    thread.start()

async def _scrape(session: aiohttp.ClientSession) -> None:
    async with session.get(API_URL) as resp:
        resp.raise_for_status()
        write_data(await resp.json())


def write_data(data: dict[str, Any], database_connection: duckdb.DuckDBPyConnection = None):
    conn = database_connection or duckdb.connect(str(DB_FILE))
    try:
        vehicle_api_timestamp = datetime.datetime.fromtimestamp(int(data['lastTime']['time']) / 1000)
        df = pl.DataFrame(data["vehicle"]).with_columns(
            fetched_at=pl.lit(datetime.datetime.now()),
            api_timestamp=pl.lit(vehicle_api_timestamp),
        )
        conn.register("_df", df)
        conn.execute(
            f"CREATE TABLE IF NOT EXISTS {TABLE_NAME} AS SELECT * FROM _df WHERE FALSE"
        )
        conn.execute(f"""
            INSERT INTO {TABLE_NAME}
            SELECT DISTINCT * FROM _df d
            WHERE NOT EXISTS (
                SELECT 1 FROM {TABLE_NAME} v
                WHERE v.id = d.id AND v.api_timestamp = d.api_timestamp
            )
        """)
    finally:
        if database_connection is None:
            conn.close()


async def _scraper_loop() -> None:
    async with aiohttp.ClientSession() as session:
        while True:
            try:
                await _scrape(session)
                logger.info("Scraped successfully")
            except Exception as exc:
                logger.error("Scrape failed: %s", exc)
            await asyncio.sleep(SCRAPE_INTERVAL)


def _start_scraper() -> None:
    """Entry point for the background daemon thread."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(_scraper_loop())
