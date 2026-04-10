from typing import Any
import functools

import polars as pl


def to_geojson(data: pl.DataFrame = None) -> dict:
    if (data is None) or (len(data) == 0):
        return {"type": "FeatureCollection", "features": []}

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [row["lon"], row["lat"]]},
                "properties": row,
            }
            for row in data.to_dicts()
        ],
    }


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


def to_response(data: dict[str, Any], status: str = "ok", **kwargs) -> dict[str, Any]:
    return {"data": data, "status": status, **kwargs}
