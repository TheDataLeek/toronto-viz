import duckdb
from fastapi import FastAPI

from . import DB_FILE
from .server_utils import _configure_logging


app = FastAPI()
_configure_logging()


@app.get("/")
async def index():
    return {"status": "ok"}


@app.get("/api/data")
async def api_data():
    with duckdb.connect(str(DB_FILE), read_only=True) as conn:
        try:
            rows = conn.execute(
                """
                SELECT DISTINCT ON (id)
                *
                FROM vehicles
                ORDER BY id, api_timestamp DESC
                """
            ).pl()
        except duckdb.CatalogException:
            return []
    return rows.to_dicts()


@app.get("/api/ttc/{route_id}")
async def api_route(route_id: str):
    with duckdb.connect(str(DB_FILE), read_only=True) as conn:
        try:
            rows = conn.execute(
                """
                SELECT DISTINCT ON (id)
                *
                FROM vehicles
                WHERE routeTag = ?
                ORDER BY id, api_timestamp DESC
                """,
                [route_id],
            ).pl()
        except duckdb.CatalogException:
            return []
    return rows.to_dicts()
