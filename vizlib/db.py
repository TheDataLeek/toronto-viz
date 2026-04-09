import asyncio

import duckdb

from . import DB_FILE

_conn: duckdb.DuckDBPyConnection | None = None
lock = asyncio.Lock()


def get_conn() -> duckdb.DuckDBPyConnection:
    global _conn
    if _conn is None:
        _conn = duckdb.connect(str(DB_FILE))
    return _conn
