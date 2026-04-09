export { Chart } from './charting.js';
export { Map } from './map.js';
export * as d3 from 'd3';

import { Map as TTCMap } from './map.js';
export function init({ apiUrl } = {}) {
    new TTCMap('#map', { apiUrl });
}

