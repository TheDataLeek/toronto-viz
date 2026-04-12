INSTALL spatial;
LOAD spatial;

SELECT
  shape_id
  , ST_AsGeoJSON(shape) AS geometry
FROM routes
;