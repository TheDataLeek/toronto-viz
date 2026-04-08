import json
from unittest.mock import patch

import duckdb
import pytest
from fastapi.testclient import TestClient

import vizlib.scraper
from vizlib import SAMPLE_DATA_FILE
from vizlib.scraper import TABLE_NAME


class _SharedConn:
    """Wraps an in-memory DuckDB connection as a context manager without closing it."""

    def __init__(self, conn: duckdb.DuckDBPyConnection) -> None:
        self._conn = conn

    def __enter__(self) -> duckdb.DuckDBPyConnection:
        return self._conn

    def __exit__(self, *_) -> None:
        pass


@pytest.fixture
def client():
    """
    E2E fixture: populates an in-memory DuckDB with sample data, patches the
    server to use it instead of the on-disk DB, and suppresses the scraper thread.
    """
    mem_conn = duckdb.connect(":memory:")
    vizlib.scraper.write_data(
        json.loads(SAMPLE_DATA_FILE.read_text()),
        database_connection=mem_conn,
    )

    with patch("vizlib.server.duckdb.connect", side_effect=lambda *a, **kw: _SharedConn(mem_conn)), \
         patch("vizlib.scraper.start_scraper"):
        from vizlib.server import app
        yield TestClient(app)


def test_health(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_api_data_returns_vehicles(client):
    resp = client.get("/api/data")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_api_data_vehicle_shape(client):
    resp = client.get("/api/data")
    vehicle = resp.json()[0]
    assert "id" in vehicle
    assert "routeTag" in vehicle
    assert "api_timestamp" in vehicle


def test_api_data_deduped(client):
    """Each vehicle ID should appear at most once (latest position only)."""
    data = client.get("/api/data").json()
    ids = [v["id"] for v in data]
    assert len(ids) == len(set(ids))


def test_api_route_filters_by_route(client):
    all_vehicles = client.get("/api/data").json()
    if not all_vehicles:
        pytest.skip("sample data is empty")

    route_tag = all_vehicles[0]["routeTag"]
    resp = client.get(f"/api/ttc/{route_tag}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) > 0
    assert all(v["routeTag"] == route_tag for v in data)


def test_api_route_unknown_returns_empty(client):
    resp = client.get("/api/ttc/9999")
    assert resp.status_code == 200
    assert resp.json() == []


def test_api_route_invalid_format_returns_422(client):
    resp = client.get("/api/ttc/__bad__")
    assert resp.status_code == 422
