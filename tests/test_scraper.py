import json

import duckdb
import polars as pl
import pytest

import vizlib.scraper
from vizlib import SAMPLE_DATA_FILE
from vizlib.scraper import TABLE_NAME


def _make_payload(vehicles: list[dict], timestamp: int = 1_700_000_000_000) -> dict:
    return {"vehicle": vehicles, "lastTime": {"time": str(timestamp)}}


def _make_vehicle(id: str, **kwargs) -> dict:
    return {"id": id, "routeTag": "1", "lat": "43.65", "lon": "-79.38", **kwargs}


@pytest.fixture
def conn():
    return duckdb.connect(":memory:")


def _row_count(conn: duckdb.DuckDBPyConnection) -> int:
    return conn.execute(f"SELECT COUNT(*) FROM {TABLE_NAME}").fetchone()[0]


# --- sample data ---

def test_db_write():
    test_db = duckdb.connect(":memory:")
    vizlib.scraper.write_data(json.loads(SAMPLE_DATA_FILE.read_text()), database_connection=test_db)
    df = pl.read_database(f"SELECT * FROM {TABLE_NAME};", connection=test_db)
    assert len(df) > 0


# --- basic write ---

def test_write_creates_table(conn):
    vizlib.scraper.write_data(_make_payload([_make_vehicle("1")]), database_connection=conn)
    assert _row_count(conn) == 1


def test_write_appends_metadata_columns(conn):
    vizlib.scraper.write_data(_make_payload([_make_vehicle("1")]), database_connection=conn)
    df = conn.execute(f"SELECT * FROM {TABLE_NAME}").pl()
    assert "fetched_at" in df.columns
    assert "api_timestamp" in df.columns


def test_write_multiple_vehicles(conn):
    vehicles = [_make_vehicle("1"), _make_vehicle("2"), _make_vehicle("3")]
    vizlib.scraper.write_data(_make_payload(vehicles), database_connection=conn)
    assert _row_count(conn) == 3


# --- within-batch deduplication ---

def test_within_batch_dedup(conn):
    v = _make_vehicle("1")
    vizlib.scraper.write_data(_make_payload([v, v]), database_connection=conn)
    assert _row_count(conn) == 1


# --- cross-run deduplication ---

def test_cross_run_same_timestamp_not_reinserted(conn):
    payload = _make_payload([_make_vehicle("1")], timestamp=1_700_000_000_000)
    vizlib.scraper.write_data(payload, database_connection=conn)
    vizlib.scraper.write_data(payload, database_connection=conn)
    assert _row_count(conn) == 1


def test_cross_run_new_timestamp_is_inserted(conn):
    vehicle = _make_vehicle("1")
    vizlib.scraper.write_data(_make_payload([vehicle], timestamp=1_700_000_000_000), database_connection=conn)
    vizlib.scraper.write_data(_make_payload([vehicle], timestamp=1_700_000_060_000), database_connection=conn)
    assert _row_count(conn) == 2


def test_cross_run_different_vehicle_same_timestamp_is_inserted(conn):
    ts = 1_700_000_000_000
    vizlib.scraper.write_data(_make_payload([_make_vehicle("1")], timestamp=ts), database_connection=conn)
    vizlib.scraper.write_data(_make_payload([_make_vehicle("2")], timestamp=ts), database_connection=conn)
    assert _row_count(conn) == 2
