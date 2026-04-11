import datetime

import polars as pl

from .db import query_database


def fetch_locations(cutoff_seconds: float = None) -> pl.DataFrame:
    df = query_database(
        """
            SELECT
              *
            FROM vehicles
            QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY api_timestamp DESC) = 1
            """,
    )
    df = _filter_df_for_recency(df, cutoff_seconds)

    return df


def fetch_paths(cutoff_seconds: float = None) -> pl.DataFrame:
    df = query_database(
        """
        SELECT *
        FROM vehicles
        """,
    )
    df = _filter_df_for_recency(df, cutoff_seconds)

    df = df.group_by("id").agg(
        path=pl.struct(pl.all()),
        avgSpeedKmHr=pl.col("speedKmHr")
        .cast(pl.Float64, strict=False)
        .fill_null(0)
        .mean(),
    )

    return df


def _filter_df_for_recency(
    df: pl.DataFrame, cutoff_seconds: float = None
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
