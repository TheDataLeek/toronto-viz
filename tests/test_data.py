import json
from unittest.mock import patch

from vizlib import SQL_DIR
from vizlib.db import query_database


def test_current_locations(test_db):
    with patch("vizlib.db.get_write_conn", return_value=test_db):
        result = query_database(SQL_DIR / "current_locations.sql", [300])

    assert len(result) == 2
    assert sorted(result["id"].to_list()) == ["veh-1", "veh-2"]
    geometry = json.loads(result.filter(result["id"] == "veh-1")["geometry"].item())
    assert geometry["type"] == "Point"


def test_current_paths(test_db):
    with patch("vizlib.db.get_write_conn", return_value=test_db):
        result = query_database(SQL_DIR / "current_paths.sql", [300])

    assert len(result) == 2
    assert sorted(result["id"].to_list()) == ["veh-1", "veh-2"]
    geometry = json.loads(result.filter(result["id"] == "veh-1")["geometry"].item())
    assert geometry["type"] == "LineString"


def test_stops(test_db):
    with patch("vizlib.db.get_write_conn", return_value=test_db):
        result = query_database(SQL_DIR / "stops.sql")

    assert list(result.columns) == ["stop_id", "geometry"]
    assert sorted(result["stop_id"].to_list()) == ["1001", "1002"]
    geometry = json.loads(result["geometry"].item(0))
    assert geometry["type"] == "Point"


def test_routes(test_db):
    with patch("vizlib.db.get_write_conn", return_value=test_db):
        result = query_database(SQL_DIR / "routes.sql")

    assert list(result.columns) == ["shape_id", "geometry"]
    assert result["shape_id"].to_list() == ["shape-1"]
    geometry = json.loads(result["geometry"].item())
    assert geometry["type"] == "LineString"
