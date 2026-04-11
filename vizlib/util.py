from typing import Any
import contextlib
import functools

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


def to_geojson(data: pl.DataFrame = None, sort_paths_by: str = None) -> dict:
    if (data is None) or (len(data) == 0):
        return {"type": "FeatureCollection", "features": []}

    features = []
    for row in data.to_dicts():
        geojson_record = {
            "type": "Feature",
            "properties": {
                k: v for k, v in row.items() if k not in ["path", "lat", "lon"]
            },
        }
        geometry = None
        match row:
            case {"path": points}:
                if sort_paths_by is not None:
                    coords = [
                        [p["lon"], p["lat"]]
                        for p in sorted(points, key=lambda p: p[sort_paths_by])
                    ]
                else:
                    coords = [[p["lon"], p["lat"]] for p in points]
                geometry = {"type": "LineString", "coordinates": coords}
                geojson_record["points"] = points
            case {"lat": latitude, "lon": longitude}:
                geometry = {
                    "type": "Point",
                    "coordinates": [longitude, latitude],
                }

        if geometry is not None:
            geojson_record["geometry"] = geometry
            features.append(geojson_record)

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def to_response(data: dict[str, Any], status: str = "ok", **kwargs) -> dict[str, Any]:
    return {"data": data, "status": status, **kwargs}
