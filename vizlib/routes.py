import duckdb
import polars as pl
from fastapi import APIRouter, Path, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from .db import get_conn, lock
from .util import to_geojson, to_geojson_paths, to_response

limiter = Limiter(key_func=get_remote_address)

router = APIRouter()

@router.get("/")
async def index():
    return {"status": "ok"}


@router.get("/api/data")
@limiter.limit("30/minute")
async def api_data(request: Request):
    rows = None
    async with lock:
        try:
            rows = get_conn().execute(
                """
                SELECT DISTINCT ON (id)
                *
                FROM vehicles
                  WHERE CAST(secsSinceReport AS INT) < (60 * 10)
                ORDER BY id, api_timestamp DESC
                """
            ).pl()
        except duckdb.CatalogException:
            pass
    return to_geojson(rows)

@router.get("/api/paths")
@limiter.limit("30/minute")
async def api_paths(request: Request, seconds: int = 5 * 60):
    rows = None
    async with lock:
        try:
            rows = get_conn().execute(
                """
                SELECT *
                FROM vehicles
                WHERE api_timestamp > epoch_ms(now()) - ? * 1000
                ORDER BY id, api_timestamp ASC
                """,
                [seconds],
            ).pl()
        except duckdb.CatalogException:
            pass
    return to_geojson_paths(rows)


@router.get("/api/ttc/{route_id}")
@limiter.limit("60/minute")
async def api_route(
    request: Request,
    route_id: str = Path(pattern=r"^\d{1,4}[A-Z]{0,2}$"),
):
    rows = None
    async with lock:
        try:
            rows = get_conn().execute(
                """
                SELECT DISTINCT ON (id)
                *
                FROM vehicles
                WHERE routeTag = ?
                    AND CAST(secsSinceReport AS INT) < (60 * 10)
                ORDER BY id, api_timestamp DESC
                """,
                [route_id],
            ).pl()
        except duckdb.CatalogException:
            pass
    return to_geojson(rows)
