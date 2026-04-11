export { Chart } from './charting.js';
export { Map } from './map.js';
export * as d3 from 'd3';

import { Map as TTCMap } from './map.js';
export function init({ baseUrl } = {}) {
    new TTCMap('#map', { baseUrl, margin: {
            top: 100,
            bottom: 100,
            left: 100,
            right: 100,
        }});
}

