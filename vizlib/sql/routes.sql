INSTALL spatial;
LOAD spatial;
INSTALL json;
LOAD json;

WITH features AS (
    SELECT CAST({
        type: 'Feature',
        geometry: ST_AsGeoJSON(shape),
        properties: {
            shape_id: shape_id
        }
    } AS JSON) AS feature
    FROM routes
)

SELECT CAST({
    type: 'FeatureCollection',
    features: list(json(feature))
} AS JSON) AS geojson
FROM features
;
