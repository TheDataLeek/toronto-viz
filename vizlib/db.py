import polars as pl
import duckdb

from . import DB_FILE

_write_conn: duckdb.DuckDBPyConnection | None = None


def get_write_conn() -> duckdb.DuckDBPyConnection:
    global _write_conn
    if _write_conn is None:
        _write_conn = duckdb.connect(str(DB_FILE))
    return _write_conn


def query_database(query: str, *args, **kwargs) -> pl.DataFrame:
    rows = pl.DataFrame()
    try:
        rows = get_write_conn().execute(query, *args, **kwargs).pl()
    except duckdb.CatalogException:
        pass

    return rows


def load_spatial(conn: duckdb.DuckDBPyConnection | None = None):
    if conn is None:
        conn = get_write_conn()
    try:
        conn.execute("SELECT ST_X(ST_GeomFromText('POINT(0 0)'))")
    except duckdb.Error:
        conn.execute("INSTALL spatial")
        conn.execute("LOAD spatial")
