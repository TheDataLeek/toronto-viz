INSTALL spatial;
LOAD spatial;

CREATE OR REPLACE TABLE stops AS (
    SELECT
        stop_id
        ,stop_code
        ,stop_name
        ,stop_desc
        ,zone_id
        ,stop_url
        ,location_type
        ,parent_station
        ,stop_timezone
        ,wheelchair_boarding
        , ST_POINT(stop_lon, stop_lat) AS coords
    FROM ttc_stops
);


DROP TABLE ttc_stops;