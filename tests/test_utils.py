import datetime

import duckdb
import polars as pl
import pytest

from vizlib.db import load_spatial
from vizlib.util import to_geojson


def _spatial_conn() -> duckdb.DuckDBPyConnection:
    """Return an in-memory DuckDB connection with the spatial extension loaded."""
    conn = duckdb.connect(":memory:")
    load_spatial(conn)
    return conn


def test_to_geojson_none_returns_empty_collection():
    result = to_geojson(None)
    assert result == {"type": "FeatureCollection", "features": []}


def test_to_geojson_empty_dataframe_returns_empty_collection():
    result = to_geojson(pl.DataFrame())
    assert result == {"type": "FeatureCollection", "features": []}


def test_to_geojson_lat_lon_produces_point():
    df = pl.DataFrame({"id": ["v1"], "lat": ["43.65"], "lon": ["-79.38"]})
    result = to_geojson(df)

    assert result["type"] == "FeatureCollection"
    assert len(result["features"]) == 1
    feature = result["features"][0]
    assert feature["type"] == "Feature"
    assert feature["geometry"] == {"type": "Point", "coordinates": ["-79.38", "43.65"]}
    assert "id" in feature["properties"]
    assert "lat" not in feature["properties"]
    assert "lon" not in feature["properties"]


def test_to_geojson_coords_produces_point():
    """Rows with a coords column (DuckDB GEOMETRY type) produce Point features (used for stops data)."""
    conn = _spatial_conn()
    df = conn.execute(
        """
        SELECT '1001' AS stop_id, [ST_X(CAST('POINT(-79.383 43.653)' AS GEOMETRY)), ST_Y(CAST('POINT(-79.383 43.653)' AS GEOMETRY))] AS coords
        UNION ALL
        SELECT '1002', [ST_X(CAST('POINT(-79.400 43.670)' AS GEOMETRY)), ST_Y(CAST('POINT(-79.400 43.670)' AS GEOMETRY))]
        """
    ).pl()

    result = to_geojson(df)

    assert result["type"] == "FeatureCollection"
    assert len(result["features"]) == 2

    feature = result["features"][0]
    assert feature["type"] == "Feature"
    assert feature["geometry"]["type"] == "Point"
    assert len(feature["geometry"]["coordinates"]) == 2
    assert feature["properties"]["stop_id"] == "1001"
    assert "coords" not in feature["properties"]


def test_to_geojson_coords_excludes_rows_without_geometry():
    """Rows that don't match any geometry pattern are silently dropped."""
    df = pl.DataFrame({"stop_id": ["1001"], "name": ["Union"]})
    result = to_geojson(df)
    assert result["features"] == []


def test_to_geojson_path_produces_linestring():
    now = datetime.datetime.now()
    path_points = [
        {"lon": "-79.1", "lat": "43.1", "api_timestamp": now},
        {"lon": "-79.2", "lat": "43.2", "api_timestamp": now},
    ]
    df = pl.from_dicts(
        [{"id": "v1", "avgSpeedKmHr": 10.0, "path": path_points}],
        schema_overrides={"path": pl.List(pl.Struct({"lon": pl.String, "lat": pl.String, "api_timestamp": pl.Datetime}))},
    )
    result = to_geojson(df)

    assert len(result["features"]) == 1
    feature = result["features"][0]
    assert feature["geometry"]["type"] == "LineString"
    assert feature["geometry"]["coordinates"] == [["-79.1", "43.1"], ["-79.2", "43.2"]]
    assert "id" in feature["properties"]
    assert "path" not in feature["properties"]


def test_to_geojson_path_sorted_by_timestamp():
    t0 = datetime.datetime(2024, 1, 1, 12, 0, 0)
    t1 = datetime.datetime(2024, 1, 1, 12, 0, 30)
    # Deliberately out of order
    path_points = [
        {"lon": "-79.2", "lat": "43.2", "api_timestamp": t1},
        {"lon": "-79.1", "lat": "43.1", "api_timestamp": t0},
    ]
    df = pl.from_dicts(
        [{"id": "v1", "avgSpeedKmHr": 5.0, "path": path_points}],
        schema_overrides={"path": pl.List(pl.Struct({"lon": pl.String, "lat": pl.String, "api_timestamp": pl.Datetime}))},
    )
    result = to_geojson(df, sort_paths_by="api_timestamp")

    coords = result["features"][0]["geometry"]["coordinates"]
    # After sorting by api_timestamp ascending: t0 point first, t1 point second
    assert coords == [["-79.1", "43.1"], ["-79.2", "43.2"]]
