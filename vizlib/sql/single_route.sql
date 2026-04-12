INSTALL spatial;
LOAD spatial;

SELECT DISTINCT ON (route_id)
  route_id
  , ST_AsGeoJSON(shape) AS geometry
FROM ttc_trips
LEFT JOIN routes
  ON routes.shape_id = ttc_trips.shape_id
;