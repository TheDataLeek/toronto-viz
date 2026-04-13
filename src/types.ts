import type * as d3 from 'd3';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';

export type { Feature, FeatureCollection, LineString, Point };

export interface PathProperties {
    avgSpeedKmHr: number;
    lastHeading: number | null;
}

export type RouteFeature = Feature<LineString>;
export type StopFeature = Feature<Point>;
export type PathFeature = Feature<LineString, PathProperties>;

export interface Margins {
    top: number;
    bottom: number;
    left: number;
    right: number;
}

export interface Theme {
    bg: string;
    routes: string;
    stopsFill: string;
    stopsStroke: string;
    speedScale: string[];
    speedColorScale: d3.ScaleLinear<string, string>;
}

export interface FetchResult<T = unknown> {
    name: string;
    data: T;
}

export interface MapData {
    'ttc:routes': FeatureCollection<LineString>;
    'ttc:stops': FeatureCollection<Point>;
    'ttc:paths': FeatureCollection<LineString, PathProperties>;
}
