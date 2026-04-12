import datetime
import json
from unittest.mock import patch

import polars as pl

import vizlib.data


def test_fetching_paths(test_db):
    with patch("vizlib.db.get_write_conn", return_value=test_db):
        result = vizlib.data.fetch_paths()

    assert result["id"].sort().to_list() == ["veh-1", "veh-2"]


def test_filter_df_for_recency_excludes_old_api_timestamps():
    now = datetime.datetime.now()
    df = pl.DataFrame(
        {
            "id": ["a", "b", "c"],
            "secsSinceReport": ["10", "10", "10"],
            "api_timestamp": [
                now - datetime.timedelta(seconds=5),
                now - datetime.timedelta(seconds=30),
                now - datetime.timedelta(seconds=120),
            ],
        }
    )

    result = vizlib.data._filter_df_for_recency(df, cutoff_seconds=60)

    assert result["id"].to_list() == ["a", "b"]


def test_fetch_paths_only_groups_recent_points(test_db):
    with patch("vizlib.db.get_write_conn", return_value=test_db):
        result = vizlib.data.fetch_paths(cutoff_seconds=60)

    assert len(result) == 1
    assert result["id"].to_list() == ["veh-1"]
    assert result["avgSpeedKmHr"].to_list() == [15.0]
    geometry = json.loads(result["geometry"].item())
    assert geometry["type"] == "LineString"
    assert len(geometry["coordinates"]) == 2


def test_fetch_locations_deduplicates(test_db):
    """fetch_locations returns only the latest row per vehicle id."""
    with patch("vizlib.db.get_write_conn", return_value=test_db):
        result = vizlib.data.fetch_locations()

    headings_by_id = dict(zip(result["id"].to_list(), result["heading"].to_list()))

    assert len(result) == 2
    assert headings_by_id == {"veh-1": "180", "veh-2": "45"}


def test_fetch_stops_returns_geojson_geometry(test_db):
    """fetch_stops returns a DataFrame with stop_id and GeoJSON geometry."""
    with patch("vizlib.db.get_write_conn", return_value=test_db):
        result = vizlib.data.fetch_stops()

    assert list(result.columns) == ["stop_id", "geometry"]
    assert result["stop_id"].to_list() == ["1001", "1002"]
    geometry = json.loads(result["geometry"].item(0))
    assert geometry["type"] == "Point"
