INSTALL spatial;
LOAD spatial;

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
  , LAST(heading) AS lastHeading
  FROM vehicles
  WHERE api_timestamp >= current_localtimestamp() - (? * INTERVAL '1 second')
  GROUP BY id
)

SELECT
  id
, ST_AsGeoJSON(ST_MAKELINE(point_list)) AS geometry
, avgSpeedKmHr
, lastHeading
FROM base
WHERE length(point_list) > 1
;