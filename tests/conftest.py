import datetime

import duckdb
import polars as pl
import pytest

from vizlib.db import load_spatial


@pytest.fixture
def test_db():
    mem_conn = duckdb.connect(":memory:")
    load_spatial(mem_conn)
    now = datetime.datetime.now()

    vehicles = pl.DataFrame(
        {
            "routeTag": ["1", "1", "1", "2", "2"],
            "predictable": ["true", "true", "true", "true", "true"],
            "heading": ["270", "90", "180", "135", "45"],
            "speedKmHr": ["30", "10", "20", "25", "15"],
            "lon": ["-79.30", "-79.10", "-79.20", "-79.45", "-79.40"],
            "id": ["veh-1", "veh-1", "veh-1", "veh-2", "veh-2"],
            "dirTag": ["1_0_1", "1_0_1", "1_0_1", "2_0_1", "2_0_1"],
            "lat": ["43.30", "43.10", "43.20", "43.75", "43.70"],
            "secsSinceReport": ["120", "30", "5", "200", "75"],
            "fetched_at": [now, now, now, now, now],
            "api_timestamp": [
                now - datetime.timedelta(seconds=120),
                now - datetime.timedelta(seconds=30),
                now - datetime.timedelta(seconds=5),
                now - datetime.timedelta(seconds=200),
                now - datetime.timedelta(seconds=75),
            ],
        }
    )
    mem_conn.register("_vehicles_df", vehicles)
    mem_conn.execute("CREATE TABLE vehicles AS SELECT * FROM _vehicles_df")
    mem_conn.execute(
        """
        CREATE TABLE stops AS
        SELECT '1001' AS stop_id, CAST('POINT(-79.383 43.653)' AS GEOMETRY) AS coords
        UNION ALL
        SELECT '1002', CAST('POINT(-79.400 43.670)' AS GEOMETRY)
        """
    )
    mem_conn.execute(
        """
        CREATE TABLE routes AS
        SELECT
            'shape-1' AS shape_id,
            CAST(
                'LINESTRING(-79.400 43.650, -79.390 43.660, -79.380 43.670)'
                AS GEOMETRY
            ) AS shape
        """
    )

    yield mem_conn
    mem_conn.close()
