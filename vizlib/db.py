from pathlib import Path

import polars as pl
import duckdb
from loguru import logger

from . import DB_FILE

_write_conn: duckdb.DuckDBPyConnection | None = None


def get_write_conn() -> duckdb.DuckDBPyConnection:
    global _write_conn
    if _write_conn is None:
        _write_conn = duckdb.connect(str(DB_FILE))
    return _write_conn


def query_database(query: str | Path, *args, **kwargs) -> pl.DataFrame:
    if isinstance(query, Path):
        query = query.read_text()

    rows = pl.DataFrame()
    try:
        rows = get_write_conn().execute(query, *args, **kwargs).pl()
    except duckdb.CatalogException:
        pass

    return rows


def load_spatial(conn: duckdb.DuckDBPyConnection | None = None):
    if conn is None:
        conn: duckdb.DuckDBPyConnection = get_write_conn()
    try:
        conn.execute("SELECT ST_X(ST_GeomFromText('POINT(0 0)'))")
    except duckdb.Error:
        conn.execute("INSTALL spatial")
        conn.execute("LOAD spatial")


def build_derived_route_tables(conn: duckdb.DuckDBPyConnection | None = None):
    if conn is None:
        conn: duckdb.DuckDBPyConnection = get_write_conn()

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
                , ST_POINT(stop_lon, stop_lat) AS coords
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
                , ST_MAKELINE(LIST(ST_POINT(shape_pt_lon, shape_pt_lat) ORDER BY shape_pt_sequence)) AS shape
            FROM ttc_shapes
            GROUP BY shape_id
        );
        """
    )
    logger.info("Route scrape complete: stops and routes tables updated")
