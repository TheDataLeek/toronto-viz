INSTALL spatial;
LOAD spatial;
INSTALL json;
LOAD json;

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
    HAVING length(point_list) > 1
),

features AS (
    SELECT CAST({
        type: 'Feature',
        geometry: ST_AsGeoJSON(ST_MAKELINE(point_list)),
        properties: {
            id: id,
            avgSpeedKmHr: avgSpeedKmHr,
            lastHeading: lastHeading
        }
    } AS JSON) AS feature
    FROM base
)

SELECT CAST({
    type: 'FeatureCollection',
    features: list(json(feature))
} AS JSON) AS geojson
FROM features
;
