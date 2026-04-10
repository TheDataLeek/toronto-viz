import datetime
from unittest.mock import patch

import duckdb
import polars as pl

import vizlib.data


def test_fetching_paths():
    result = vizlib.data.fetch_paths()

    assert len(result) > 0


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


def test_fetch_paths_only_groups_recent_points():
    now = datetime.datetime.now()
    mem_conn = duckdb.connect(":memory:")
    df = pl.DataFrame(
        {
            "routeTag": ["1", "1", "1"],
            "predictable": ["true", "true", "true"],
            "heading": ["0", "0", "0"],
            "speedKmHr": ["10", "10", "10"],
            "lon": ["-79.1", "-79.2", "-79.3"],
            "id": ["veh-1", "veh-1", "veh-1"],
            "dirTag": ["1_0_1", "1_0_1", "1_0_1"],
            "lat": ["43.1", "43.2", "43.3"],
            "secsSinceReport": ["5", "5", "5"],
            "fetched_at": [now, now, now],
            "api_timestamp": [
                now - datetime.timedelta(seconds=5),
                now - datetime.timedelta(seconds=30),
                now - datetime.timedelta(seconds=120),
            ],
        }
    )
    mem_conn.register("_df", df)
    mem_conn.execute("CREATE TABLE vehicles AS SELECT * FROM _df")

    with patch("vizlib.db.get_write_conn", return_value=mem_conn):
        result = vizlib.data.fetch_paths(cutoff_seconds=60)

    assert len(result) == 1
    assert result["path"].list.len().to_list() == [2]
