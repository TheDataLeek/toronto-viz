from typing import Any
import functools

import polars as pl


PROPERTY_COLS = ["id", "routeTag", "dirTag", "heading", "speedKmHr", "predictable", "secsSinceReport", "api_timestamp", "fetched_at"]


def to_geojson(rows: pl.DataFrame = None) -> dict:
    if rows is None:
        return {"type": "FeatureCollection", "features": []}

    features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [row["lon"], row["lat"]]},
            "properties": {col: row[col] for col in PROPERTY_COLS if col in row},
        }
        for row in rows.to_dicts()
    ]
    return {"type": "FeatureCollection", "features": features}



def to_geojson_paths(rows: pl.DataFrame = None) -> dict:
    if rows is None:
        return {"type": "FeatureCollection", "features": []}

    features = []
    for (vehicle_id,), group in rows.group_by("id", maintain_order=True):
        dicts = group.to_dicts()
        coords = [[row["lon"], row["lat"]] for row in dicts]
        last = dicts[-1]
        props = {col: last[col] for col in PROPERTY_COLS if col in last}
        if len(coords) == 1:
            geometry = {"type": "Point", "coordinates": coords[0]}
        else:
            geometry = {"type": "LineString", "coordinates": coords}
        features.append({"type": "Feature", "geometry": geometry, "properties": props})
    return {"type": "FeatureCollection", "features": features}


def to_response(data: dict[str, Any], status: str='ok', **kwargs) -> dict[str, Any]:
    return {
        'data': data,
        'status': status,
        **kwargs
    }

