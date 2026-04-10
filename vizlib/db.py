from typing import Iterator
import polars as pl
import duckdb

from . import DB_FILE

_write_conn: duckdb.DuckDBPyConnection | None = None
_read_conn: duckdb.DuckDBPyConnection | None = None


def get_write_conn() -> duckdb.DuckDBPyConnection:
    global _write_conn
    if _write_conn is None:
        _write_conn = duckdb.connect(str(DB_FILE))
    return _write_conn


def get_read_conn() -> duckdb.DuckDBPyConnection:
    global _read_conn
    if _read_conn is None:
        _read_conn = duckdb.connect(str(DB_FILE), read_only=True)
    return _read_conn


def query_database(query: str, *args, **kwargs) -> pl.DataFrame:
    rows = pl.DataFrame()
    try:
        rows = get_read_conn().execute(query, *args, **kwargs).pl()
    except duckdb.CatalogException:
        pass

    return rows
