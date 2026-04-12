INSTALL spatial;
LOAD spatial;
INSTALL json;
LOAD json;

WITH features AS (
    SELECT CAST({
        type: 'Feature',
        geometry: ST_AsGeoJSON(ST_Simplify(shape, 0.0001)),
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
