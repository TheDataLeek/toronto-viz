INSTALL spatial;
LOAD spatial;
INSTALL json;
LOAD json;



WITH features AS (
    SELECT CAST({
        type: 'Feature',
        geometry: ST_AsGeoJSON(coords),
        properties: {
            stop_id: stop_id,
            stopName: stop_name,
            labelDirection: (ROW_NUMBER() OVER (PARTITION BY LOWER(stop_name)[:10] ORDER BY LENGTH(stop_name)) - 1) % 4
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
