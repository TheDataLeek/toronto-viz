import duckdb
import polars as pl

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


def test_to_geojson_geometry_produces_point():
    conn = _spatial_conn()
    df = conn.execute(
        """
        SELECT
            'v1' AS id,
            ST_AsGeoJSON(ST_POINT(-79.38, 43.65)) AS geometry
        """
    ).pl()
    result = to_geojson(df)

    assert result["type"] == "FeatureCollection"
    assert len(result["features"]) == 1
    feature = result["features"][0]
    assert feature["type"] == "Feature"
    assert feature["geometry"] == {"type": "Point", "coordinates": [-79.38, 43.65]}
    assert "id" in feature["properties"]
    assert "geometry" not in feature["properties"]


def test_to_geojson_geometry_produces_multiple_points():
    conn = _spatial_conn()
    df = conn.execute(
        """
        SELECT
            '1001' AS stop_id,
            ST_AsGeoJSON(CAST('POINT(-79.383 43.653)' AS GEOMETRY)) AS geometry
        UNION ALL
        SELECT
            '1002',
            ST_AsGeoJSON(CAST('POINT(-79.400 43.670)' AS GEOMETRY))
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
    assert "geometry" not in feature["properties"]


def test_to_geojson_excludes_rows_without_geometry():
    """Rows that don't match any geometry pattern are silently dropped."""
    df = pl.DataFrame({"stop_id": ["1001"], "name": ["Union"]})
    result = to_geojson(df)
    assert result["features"] == []


def test_to_geojson_geometry_produces_linestring():
    conn = _spatial_conn()
    df = conn.execute(
        """
        SELECT
            'v1' AS id,
            10.0 AS avgSpeedKmHr,
            ST_AsGeoJSON(CAST('LINESTRING(-79.1 43.1, -79.2 43.2)' AS GEOMETRY)) AS geometry
        """
    ).pl()
    result = to_geojson(df)

    assert len(result["features"]) == 1
    feature = result["features"][0]
    assert feature["geometry"]["type"] == "LineString"
    assert feature["geometry"]["coordinates"] == [[-79.1, 43.1], [-79.2, 43.2]]
    assert "id" in feature["properties"]
    assert "geometry" not in feature["properties"]
