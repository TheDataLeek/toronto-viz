import asyncio
import datetime
from typing import Any

import aiohttp
import duckdb
import polars as pl
from loguru import logger

from . import API_URL, SCRAPE_INTERVAL
from .db import get_conn, lock

TABLE_NAME = 'vehicles'


async def _scrape(session: aiohttp.ClientSession, last_time: str) -> str:
    async with session.get(API_URL, params={"t": last_time}) as resp:
        resp.raise_for_status()
        data = await resp.json()
        async with lock:
            await asyncio.to_thread(write_data, data, get_conn())
        return data["lastTime"]["time"]


def write_data(data: dict[str, Any], database_connection: duckdb.DuckDBPyConnection | None = None):
    conn = database_connection or get_conn()
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
            WHERE v.id = d.id AND v.lat = d.lat AND v.lon = d.lon
        )
    """)


async def scraper_loop() -> None:
    last_time = "0"
    async with aiohttp.ClientSession() as session:
        while True:
            try:
                last_time = await _scrape(session, last_time)
                logger.info("Scraped successfully")
            except Exception as exc:
                logger.error("Scrape failed: %s", exc)
            await asyncio.sleep(SCRAPE_INTERVAL)
