from typing import Any
import contextlib
import json

import aiohttp
import polars as pl


@contextlib.asynccontextmanager
async def ensure_valid_session(session: aiohttp.ClientSession | None):
    spawned_session = False
    if session is None:
        spawned_session = True
        session: aiohttp.ClientSession = aiohttp.ClientSession()

    yield session

    if spawned_session:
        await session.close()


def to_geojson(data: pl.DataFrame = None) -> dict:
    if (data is None) or (len(data) == 0):
        return {"type": "FeatureCollection", "features": []}

    features = []
    for row in data.to_dicts():
        geometry = row.get("geometry")
        if geometry is None:
            continue

        geojson_record = {
            "type": "Feature",
            "properties": {k: v for k, v in row.items() if k != "geometry"},
            "geometry": json.loads(geometry),
        }
        features.append(geojson_record)

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def to_response(data: dict[str, Any], status: str = "ok", **kwargs) -> dict[str, Any]:
    return {"data": data, "status": status, **kwargs}
