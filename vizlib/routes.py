from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from .util import to_geojson
from .db import query_database
from . import SQL_DIR

limiter = Limiter(key_func=get_remote_address)

router = APIRouter()


@router.get("/")
async def index():
    return {"status": "ok"}


@router.get("/api/data")
@limiter.limit("30/minute")
async def api_data(request: Request):
    cutoff_seconds = 60

    df = query_database(SQL_DIR / "current_locations.sql", [cutoff_seconds])

    return to_geojson(df)


@router.get("/api/paths")
@limiter.limit("30/minute")
async def api_paths(request: Request, seconds: int = 5 * 60):
    df = query_database(SQL_DIR / "current_paths.sql", [seconds])
    return to_geojson(df)


@router.get("/api/stops")
@limiter.limit("30/minute")
async def api_stops(request: Request):
    df = query_database(SQL_DIR / "stops.sql")
    return to_geojson(df)


@router.get("/api/routes")
@limiter.limit("30/minute")
async def api_routes(request: Request):
    df = query_database(SQL_DIR / "routes.sql")
    return to_geojson(df)

@router.get("/api/avgSpeeds")
@limiter.limit("30/minute")
async def api_avg_speeds(request: Request):
    df = query_database(SQL_DIR / "avg_speeds.sql")
    return to_geojson(df)
