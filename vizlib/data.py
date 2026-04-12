import datetime

import polars as pl

from .db import query_database, load_spatial


def fetch_locations(cutoff_seconds: float = None) -> pl.DataFrame:
    if cutoff_seconds is None:
        cutoff_seconds = 60 * 60 * 24

    df = query_database(
        """
            SELECT
              * EXCLUDE (lat, lon)
              , ST_AsGeoJSON(
                    ST_POINT(CAST(lon AS DOUBLE), CAST(lat AS DOUBLE))
                ) AS geometry
            FROM vehicles
            WHERE api_timestamp >= current_localtimestamp() - (? * INTERVAL '1 second')
            QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY api_timestamp DESC) = 1
            """,
        [cutoff_seconds]
    )

    return df

def fetch_routes() -> pl.DataFrame:
    load_spatial()
    df = query_database("SELECT shape_id, ST_AsGeoJSON(shape) AS geometry FROM routes")
    return df


def fetch_stops() -> pl.DataFrame:
    load_spatial()
    df = query_database(
        """
        SELECT
          stop_id
          , ST_AsGeoJSON(coords) AS geometry
        FROM stops
        """
    )

    return df


def fetch_paths(cutoff_seconds: float = None) -> pl.DataFrame:
    load_spatial()

    if cutoff_seconds is None:
        cutoff_seconds = 60 * 60 * 24

    query = """
        WITH base AS (
          SELECT
            id
          , LIST(
              ST_POINT(
                CAST(lon AS DOUBLE),
                CAST(lat AS DOUBLE)
              ) ORDER BY api_timestamp
            ) AS point_list
          , AVG(CAST(speedKmHr AS DOUBLE)) AS avgSpeedKmHr
          FROM vehicles
          WHERE api_timestamp >= current_localtimestamp() - (? * INTERVAL '1 second')
          GROUP BY id
        )
        SELECT
          id
          , ST_AsGeoJSON(ST_MAKELINE(point_list)) AS geometry
          , avgSpeedKmHr
        FROM base
        WHERE length(point_list) > 1
    """

    df = query_database(query, [cutoff_seconds])

    return df

