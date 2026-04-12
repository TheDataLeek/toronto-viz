INSTALL spatial;
LOAD spatial;
INSTALL json;
LOAD json;

WITH latest AS (
    SELECT *
    FROM vehicles
    WHERE api_timestamp >= current_localtimestamp() - (? * INTERVAL '1 second')
    QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY api_timestamp DESC) = 1
),

features AS (
    SELECT CAST({
        type: 'Feature',
        geometry: ST_AsGeoJSON(ST_POINT(CAST(lon AS DOUBLE), CAST(lat AS DOUBLE))),
        properties: {
            id: id,
            routeTag: routeTag,
            dirTag: dirTag,
            heading: heading,
            predictable: predictable,
            secsSinceReport: secsSinceReport,
            speedKmHr: speedKmHr,
            fetched_at: fetched_at,
            api_timestamp: api_timestamp
        }
    } AS JSON) AS feature
    FROM latest
)

SELECT CAST({
    type: 'FeatureCollection',
    features: list(json(feature))
} AS JSON) AS geojson
FROM features
;
