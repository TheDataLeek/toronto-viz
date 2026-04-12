import datetime

import polars as pl

from .db import query_database, load_spatial


def fetch_locations(cutoff_seconds: float = None) -> pl.DataFrame:
    df = query_database(
        """
            SELECT
              * EXCLUDE (lat, lon)
              , ST_AsGeoJSON(
                    ST_POINT(CAST(lon AS DOUBLE), CAST(lat AS DOUBLE))
                ) AS geometry
            FROM vehicles
            QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY api_timestamp DESC) = 1
            """,
    )
    df = _filter_df_for_recency(df, cutoff_seconds)

    return df

def fetch_routes() -> pl.DataFrame:
    load_spatial()
    return query_database(
        "SELECT shape_id, ST_AsGeoJSON(shape) AS geometry FROM routes"
    )


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

    query = """
        SELECT
          id
          , ST_AsGeoJSON(
                ST_MAKELINE(
                    LIST(
                        ST_POINT(
                            CAST(lon AS DOUBLE),
                            CAST(lat AS DOUBLE)
                        ) ORDER BY api_timestamp
                    )
                )
            ) AS geometry
          , AVG(CAST(speedKmHr AS DOUBLE)) AS avgSpeedKmHr
        FROM vehicles
        """
    params = []

    if cutoff_seconds is not None:
        query += """
        WHERE api_timestamp >= current_localtimestamp() - (? * INTERVAL '1 second')
        """
        params.append(cutoff_seconds)

    query += """
        GROUP BY id
    """

    df = query_database(query, params)

    return df


def _filter_df_for_recency(
    df: pl.DataFrame, cutoff_seconds: float = None,
) -> pl.DataFrame:
    df = df.with_columns(
        secsSinceReport=pl.col("secsSinceReport").cast(pl.Float64, strict=False),
    )

    if cutoff_seconds is None:
        return df

    cutoff_time = datetime.datetime.now() - datetime.timedelta(seconds=cutoff_seconds)

    df = df.filter(
        pl.col("secsSinceReport").is_not_null()
        & (pl.col("secsSinceReport") < cutoff_seconds)
        & (pl.col("api_timestamp") >= pl.lit(cutoff_time))
    )

    return df
