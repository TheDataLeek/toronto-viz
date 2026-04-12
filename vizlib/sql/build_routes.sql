INSTALL spatial;
LOAD spatial;

CREATE OR REPLACE TABLE routes AS (
    SELECT
        shape_id
        , ST_MAKELINE(
           LIST(ST_POINT(shape_pt_lon, shape_pt_lat) ORDER BY shape_pt_sequence)
       ) AS shape
    FROM ttc_shapes
    GROUP BY shape_id
);


DROP TABLE ttc_shapes;