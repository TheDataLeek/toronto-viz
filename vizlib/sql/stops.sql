INSTALL spatial;
LOAD spatial;
INSTALL json;
LOAD json;

WITH features AS (
    SELECT CAST({
        type: 'Feature',
        geometry: ST_AsGeoJSON(coords),
        properties: {
            stop_id: stop_id
        }
    } AS JSON) AS feature
    FROM stops
)

SELECT CAST({
    type: 'FeatureCollection',
    features: list(json(feature))
} AS JSON) AS geojson
FROM features
;
