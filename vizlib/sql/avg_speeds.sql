INSTALL h3 FROM community;
LOAD h3;
INSTALL spatial;
LOAD spatial;

/*
Avg Speed by H3 hex cell (resolution 8, ~460m edge)

Groups all vehicle observations into ~460m hex cells and averages speed
across all routes, filtered to the current hour of day over the last 30 days.
Drops per-route granularity in exchange for a compact city-wide speed map.

todo: configurable params: lookback, hour of day, resolution
*/

WITH speed_by_hex AS (
  SELECT
    h3_latlng_to_cell(CAST(lat AS DOUBLE), CAST(lon AS DOUBLE), 8) AS hex_id,
    DATE_PART('hour', api_timestamp) AS hour_of_day,
    AVG(CAST(speedkmhr AS FLOAT)) AS speed,
    COUNT(*) AS num_observations
  FROM vehicles
  WHERE api_timestamp >= current_localtimestamp() - (90 * INTERVAL '1 day')
  GROUP BY ALL
)

, features AS (
    SELECT CAST({
        type: 'Feature',
        geometry: ST_AsGeoJSON(ST_GeomFromText(h3_cell_to_boundary_wkt(hex_id))),
        properties: {
          hexId: CAST(hex_id AS VARCHAR),
          hourOfDay: hour_of_day,
          speed: speed,
          numObservations: num_observations,
        }
    } AS JSON) AS feature
    FROM speed_by_hex
    WHERE hour_of_day = DATE_PART('hour', CURRENT_TIMESTAMP)
)

SELECT CAST({
    type: 'FeatureCollection',
    features: list(json(feature))
} AS JSON) AS geojson
FROM features
;
