INSTALL spatial;
LOAD spatial;

SELECT
  * EXCLUDE (lat, lon)
  , ST_AsGeoJSON(
      ST_POINT(CAST(lon AS DOUBLE), CAST(lat AS DOUBLE))
  ) AS geometry
FROM vehicles
WHERE api_timestamp >= current_localtimestamp() - (? * INTERVAL '1 second')
  QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY api_timestamp DESC) = 1
;
