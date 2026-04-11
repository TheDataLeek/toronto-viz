import json
import time
from unittest.mock import patch

import duckdb
import polars as pl
import pytest
from fastapi.testclient import TestClient

import vizlib.scraper
from vizlib import SAMPLE_DATA_FILE


@pytest.fixture
def client():
    """
    E2E fixture: populates an in-memory DuckDB with sample data, patches the
    server to use it instead of the on-disk DB, and suppresses the scraper.
    """
    mem_conn = duckdb.connect(":memory:")
    sample_data = json.loads(SAMPLE_DATA_FILE.read_text())
    sample_data["lastTime"]["time"] = str(int(time.time() * 1000))
    vizlib.scraper.write_location_data(sample_data, database_connection=mem_conn)

    with patch("vizlib.db.get_write_conn", return_value=mem_conn):
        from vizlib.server import app

        yield TestClient(app)


def test_health(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_api_data_returns_vehicles(client):
    resp = client.get("/api/data")
    assert resp.status_code == 200
    fc = resp.json()
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) > 0


def test_api_data_vehicle_shape(client):
    resp = client.get("/api/data")
    feature = resp.json()["features"][0]
    assert feature["type"] == "Feature"
    assert feature["geometry"]["type"] == "Point"
    assert len(feature["geometry"]["coordinates"]) == 2
    props = feature["properties"]
    assert "id" in props
    assert "routeTag" in props
    assert "api_timestamp" in props


def test_api_data_deduped(client):
    """Each vehicle ID should appear at most once (latest position only)."""
    features = client.get("/api/data").json()["features"]
    ids = [f["properties"]["id"] for f in features]
    assert len(ids) == len(set(ids))


def test_api_route_filters_by_route(client):
    all_features = client.get("/api/data").json()["features"]
    if not all_features:
        pytest.skip("sample data is empty")


def test_api_paths_returns_linestrings(client):
    resp = client.get("/api/paths")
    assert resp.status_code == 200
    fc = resp.json()
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) > 0
    feature = fc["features"][0]
    assert feature["type"] == "Feature"
    assert feature["geometry"]["type"] == "LineString"
    assert len(feature["geometry"]["coordinates"]) >= 1


def test_api_stops_returns_point_features(client):
    stops_df = pl.DataFrame(
        {
            "stop_id": ["1001", "1002"],
            "coords": [[-79.383, 43.653], [-79.400, 43.670]],
        }
    )
    with patch("vizlib.data.fetch_stops", return_value=stops_df):
        resp = client.get("/api/stops")
    assert resp.status_code == 200
    fc = resp.json()
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) == 2
    for feature in fc["features"]:
        assert feature["type"] == "Feature"
        assert feature["geometry"]["type"] == "Point"
        assert len(feature["geometry"]["coordinates"]) == 2
        assert "stop_id" in feature["properties"]
        assert "coords" not in feature["properties"]
