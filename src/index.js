export { Chart } from './charting.js';
export { Map } from './map.js';
export * as d3 from 'd3';

import { Map as TTCMap } from './map.js';
document.addEventListener('DOMContentLoaded', () => {
    new TTCMap('#map');
});

