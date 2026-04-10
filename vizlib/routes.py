import datetime

import duckdb
import polars as pl
from fastapi import APIRouter, Path, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from .db import query_database
from .util import to_geojson, to_geojson_paths

limiter = Limiter(key_func=get_remote_address)

router = APIRouter()


@router.get("/")
async def index():
    return {"status": "ok"}


@router.get("/api/data")
@limiter.limit("30/minute")
async def api_data(request: Request):
    df = (
        query_database(
            """
            SELECT DISTINCT ON (id)
              *
            FROM vehicles
            """,
        )
        .with_columns(
            secsSinceReport=pl.col("secsSinceReport").cast(pl.Float64, strict=False),
        )
        .filter(
            pl.col("secsSinceReport").is_not_null()
            & (pl.col("secsSinceReport") < (5 * 60))
        )
    )
    return to_geojson(df)


@router.get("/api/paths")
@limiter.limit("30/minute")
async def api_paths(request: Request, seconds: int = 5 * 60):
    df = query_database(
        """
        SELECT *
        FROM vehicles
        """,
    ).filter(
        pl.col('api_timestamp') >= (datetime.datetime.now().timestamp() - seconds)
    )
    return to_geojson_paths(df)


