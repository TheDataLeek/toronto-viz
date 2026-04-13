INSTALL spatial;
LOAD spatial;

/*
https://gis.stackexchange.com/questions/8650/measuring-accuracy-of-latitude-and-longitude
*/

WITH avg_speeds AS (
  SELECT
    routetag
  , DATE_PART('hour', api_timestamp) AS hour_of_day
  , ROUND(CAST(lat AS FLOAT), 4) AS lat
  , ROUND(CAST(lon AS FLOAT), 4) AS lon
  , ttc_route_types.directionname
  , AVG(CAST(heading AS FLOAT)) AS direction
  , AVG(CAST(speedkmhr AS FLOAT)) AS speed
  , COUNT(*) as num_observations
  FROM vehicles
  LEFT JOIN ttc_route_types
    ON vehicles.routetag = ttc_route_types.code
  LEFT JOIN ttc_routes
    ON ttc_routes.route_short_name = regexp_extract(vehicles.routetag, '(\d)+')
  WHERE api_timestamp >= current_localtimestamp() - (30 * INTERVAL '1 day')
  GROUP BY ALL
)

, current_speeds AS (
  SELECT
    routetag
  , DATE_PART('hour', api_timestamp) AS hour_of_day
  , ROUND(CAST(lat AS FLOAT), 4) AS lat
  , ROUND(CAST(lon AS FLOAT), 4) AS lon
  , ttc_route_types.directionname
  , AVG(CAST(heading AS FLOAT)) AS direction
  , AVG(CAST(speedkmhr AS FLOAT)) AS speed
  , COUNT(*) as num_observations
  FROM vehicles
  LEFT JOIN ttc_route_types
    ON vehicles.routetag = ttc_route_types.code
  LEFT JOIN ttc_routes
    ON ttc_routes.route_short_name = regexp_extract(vehicles.routetag, '(\d)+')
  WHERE api_timestamp >= current_localtimestamp() - INTERVAL '30 minute'
  GROUP BY ALL
)

, base AS (
  SELECT
    current_speeds.routetag
  , current_speeds.lat
  , current_speeds.lon
  , current_speeds.directionname
  , current_speeds.direction
  , current_speeds.speed AS current_speed
  , avg_speeds.speed AS avg_speed
  , (current_speeds.speed - avg_speeds.speed) / avg_speeds.speed AS relative_speed
  FROM current_speeds
    LEFT JOIN avg_speeds
  ON current_speeds.routetag = avg_speeds.routetag
    AND current_speeds.lat = avg_speeds.lat
    AND current_speeds.lon = avg_speeds.lon
    AND current_speeds.directionname = avg_speeds.directionname
)

, features AS (
    SELECT CAST({
        type: 'Feature',
        geometry: ST_AsGeoJSON(ST_POINT(lon, lat)),
        properties: {
          routetag: routetag,
          directionname: directionname,
          direction: direction,
          current_speed: current_speed,
          avg_speed: avg_speed,
          relative_speed: relative_speed,
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
