from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from .util import to_geojson
from . import data

limiter = Limiter(key_func=get_remote_address)

router = APIRouter()


@router.get("/")
async def index():
    return {"status": "ok"}


@router.get("/api/data")
@limiter.limit("30/minute")
async def api_data(request: Request):
    df = data.fetch_locations(cutoff_seconds=60)
    return to_geojson(df)


@router.get("/api/paths")
@limiter.limit("30/minute")
async def api_paths(request: Request, seconds: int = 5 * 60):
    df = data.fetch_paths(cutoff_seconds=seconds)
    return to_geojson(df, sort_paths_by="api_timestamp")

@router.get('/api/stops')
@limiter.limit("30/minute")
async def api_stops(request: Request):
    df = data.fetch_stops()
    return to_geojson(df)


@router.get('/api/routes')
@limiter.limit("30/minute")
async def api_routes(request: Request):
    df = data.fetch_routes()
    return to_geojson(df)
