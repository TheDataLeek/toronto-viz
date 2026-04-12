from pathlib import Path

import polars as pl
import duckdb
from loguru import logger

from . import DB_FILE, SQL_DIR

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


def checkpoint() -> None:
    get_write_conn().execute("CHECKPOINT")
    logger.debug("WAL checkpointed")


def build_derived_route_tables(conn: duckdb.DuckDBPyConnection | None = None):
    if conn is None:
        conn: duckdb.DuckDBPyConnection = get_write_conn()

    load_spatial()

    logger.info("Building derived stops and routes tables...")
    conn.execute((SQL_DIR / "build_stops.sql").read_text())
    logger.debug("stops table created")

    conn.execute((SQL_DIR / "build_routes.sql").read_text())
    logger.info("Route scrape complete: stops and routes tables updated")
