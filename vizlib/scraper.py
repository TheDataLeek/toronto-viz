import asyncio
import datetime
from typing import Any
import io
import zipfile

import aiohttp
import duckdb
import polars as pl
from loguru import logger

from . import API_URL, SCRAPE_INTERVAL
from .db import get_write_conn, load_spatial
from .util import ensure_valid_session

TABLE_NAME = "vehicles"


async def scraper_loop():
    last_time = "0"
    last_routes_scrape: datetime.datetime | None = None
    async with aiohttp.ClientSession() as session:
        while True:
            try:
                now = datetime.datetime.now()
                if (last_routes_scrape is None) or ((now - last_routes_scrape) >= datetime.timedelta(hours=24)):
                    logger.info("Scraping routes...")
                    await scrape_routes(session)
                    last_routes_scrape = now
            except Exception as exc:
                logger.error(f"Route scrape failed: {exc}")
            try:
                last_time = await scrape_locations(session, last_time)
            except Exception as exc:
                logger.error(f"Scrape failed: {exc}")
            await asyncio.sleep(SCRAPE_INTERVAL)


async def scrape_locations(
    session: aiohttp.ClientSession | None = None,
    last_time: str | int = 0,
) -> str:
    if isinstance(last_time, int):
        last_time = str(last_time)

    async with ensure_valid_session(session) as valid_session:
        async with valid_session.get(API_URL, params={"t": last_time}) as resp:
            resp.raise_for_status()
            data = await resp.json()
            vehicle_count = len(data.get("vehicle", []))
            write_location_data(data, get_write_conn())

    new_time = data["lastTime"]["time"]
    logger.debug(f"Fetched {vehicle_count} vehicles (t={last_time} → {new_time})")
    return new_time


async def scrape_routes(session: aiohttp.ClientSession | None = None):
    # Toronto Open Data is stored in a CKAN instance. It's APIs are documented here:
    # https://docs.ckan.org/en/latest/api/
    base_url = "https://ckan0.cf.opendata.inter.prod-toronto.ca"
    ttc_routes_and_schedules_endpoint = f"{base_url}/api/3/action/package_show"
    params = {"id": "ttc-routes-and-schedules"}

    conn = get_write_conn()

    async with ensure_valid_session(session) as valid_session:
        async with valid_session.get(
            ttc_routes_and_schedules_endpoint, params=params
        ) as resp:
            index_data = await resp.json()

        resources = index_data["result"]["resources"]
        logger.info(f"Found {len(resources)} resources in TTC routes package")
        for idx, resource in enumerate(resources):
            # To get metadata for non datastore_active resources:
            if not resource["datastore_active"]:
                logger.debug(
                    f"Fetching metadata for resource {idx}: {resource.get('name', resource['id'])}"
                )
                sub_index_url = (
                    f"{base_url}/api/3/action/resource_show?id={resource['id']}"
                )
                async with valid_session.get(sub_index_url) as resp:
                    resource_metadata = await resp.json()
                data_url = resource_metadata["result"]["url"]
                logger.info(f"Downloading zip from {data_url}")
                async with valid_session.get(data_url) as resp:
                    zip_buffer = io.BytesIO(await resp.read())
                    zip_data = zipfile.ZipFile(zip_buffer)

                files = zip_data.namelist()
                logger.info(f"Zip contains {len(files)} files: {files}")
                for name in files:
                    table_name = f"ttc_{name.split('.')[0]}"
                    with zip_data.open(name, mode="r") as obj:
                        df = pl.read_csv(obj)
                    logger.info(f"Writing {len(df)} rows to table {table_name}")
                    conn.register("_df", df)
                    conn.execute(
                        f"""
                            CREATE OR REPLACE TABLE {table_name} AS
                            SELECT * FROM _df
                        """
                    )
                    logger.debug(f"Table {table_name} created/replaced successfully")

    load_spatial()

    logger.info("Building derived stops and routes tables...")
    conn.execute(
        f"""
        CREATE OR REPLACE TABLE stops AS (
            SELECT
                stop_id
                ,stop_code
                ,stop_name
                ,stop_desc
                ,zone_id
                ,stop_url
                ,location_type
                ,parent_station
                ,stop_timezone
                ,wheelchair_boarding
                , CAST(
                    'POINT(' || CAST(stop_lon AS STRING) || ' ' || CAST(stop_lat AS STRING) || ')'
                  AS GEOMETRY) AS coords
            FROM ttc_stops
        );
        """
    )
    logger.debug("stops table created")

    conn.execute(
        f"""
        CREATE OR REPLACE TABLE routes AS (
            SELECT
                shape_id
                , CAST('LINESTRING(' || ARRAY_TO_STRING(
                    LIST(
                        CAST(shape_pt_lon AS STRING) || ' ' || CAST(shape_pt_lat AS STRING)
                        ORDER BY shape_pt_sequence
                    ), ', ') || ')'  AS GEOMETRY) as shape
            FROM ttc_shapes
            GROUP BY shape_id
        );
        """
    )
    logger.info("Route scrape complete: stops and routes tables updated")


def write_location_data(
    data: dict[str, Any],
    database_connection: duckdb.DuckDBPyConnection | None = None,
):
    conn = database_connection or get_write_conn()
    vehicle_api_timestamp = datetime.datetime.fromtimestamp(
        int(data["lastTime"]["time"]) / 1000
    )
    df = pl.DataFrame(data["vehicle"]).with_columns(
        fetched_at=pl.lit(datetime.datetime.now()),
        api_timestamp=pl.lit(vehicle_api_timestamp),
    )
    conn.register("_df", df)
    conn.execute(
        f"""
            CREATE TABLE IF NOT EXISTS {TABLE_NAME} AS
            SELECT DISTINCT * FROM _df
        """
    )
    result = conn.execute(f"""
        INSERT INTO {TABLE_NAME}
        SELECT DISTINCT * FROM _df d
        WHERE NOT EXISTS (
            SELECT 1 FROM {TABLE_NAME} v
            WHERE v.id = d.id AND v.lat = d.lat AND v.lon = d.lon
        )
        RETURNING 1
    """)
    inserted = len(result.fetchall())
    skipped = len(df) - inserted
    logger.info(
        f"Wrote location data: {inserted} new rows inserted, {skipped} duplicates skipped"
        f" (api_timestamp={vehicle_api_timestamp.isoformat()})"
    )
