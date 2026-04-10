import json
from unittest.mock import patch

import duckdb
import pytest
from fastapi.testclient import TestClient

import vizlib.scraper
from vizlib import SAMPLE_DATA_FILE
from vizlib.scraper import TABLE_NAME


@pytest.fixture
def client():
    """
    E2E fixture: populates an in-memory DuckDB with sample data, patches the
    server to use it instead of the on-disk DB, and suppresses the scraper.
    """
    mem_conn = duckdb.connect(":memory:")
    vizlib.scraper.write_data(
        json.loads(SAMPLE_DATA_FILE.read_text()),
        database_connection=mem_conn,
    )

    async def _noop_scraper():
        pass

    with patch("vizlib.db.get_conn", return_value=mem_conn), \
         patch("vizlib.server.scraper_loop", _noop_scraper):
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

    route_tag = all_features[0]["properties"]["routeTag"]
    resp = client.get(f"/api/ttc/{route_tag}")
    assert resp.status_code == 200
    features = resp.json()["features"]
    assert len(features) > 0
    assert all(f["properties"]["routeTag"] == route_tag for f in features)


def test_api_route_unknown_returns_empty(client):
    resp = client.get("/api/ttc/9999")
    assert resp.status_code == 200
    fc = resp.json()
    assert fc["type"] == "FeatureCollection"
    assert fc["features"] == []


def test_api_route_invalid_format_returns_422(client):
    resp = client.get("/api/ttc/__bad__")
    assert resp.status_code == 422
