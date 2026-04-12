INSTALL spatial;
LOAD spatial;

SELECT
  stop_id
, ST_AsGeoJSON(coords) AS geometry
FROM stops
;
