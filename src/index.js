export { Chart } from './charting.js';
export { Map } from './map.js';
export * as d3 from 'd3';

import { Map as TTCMap } from './map.js';
import {fetchJSON} from './data'

export function init({ baseUrl } = {}) {
    Promise.allSettled([
        fetchJSON(`${baseUrl}/api/routes`, 'ttc:routes'),
        fetchJSON(`${baseUrl}/api/stops`, 'ttc:stops'),
        fetchJSON(`${baseUrl}/api/paths`, 'ttc:paths'),
    ])
        .then(results => {
            const failures = results.filter(r => r.status === 'rejected');
            if (failures.length) {
                failures.forEach(r => console.warn('Pre-fetch failed:', r.reason));
                const status = document.querySelector('#status');
                if (status) status.textContent = `${failures.length} data source(s) failed to load`;
                throw new Error(`${failures.length} pre-fetch(es) failed, aborting map init`);
            }

            const data = Object.fromEntries(
                results
                    .filter(r => r.status === 'fulfilled' && r.value)
                    .map(r => [r.value.name, r.value.data])
            );

            console.log(data);

            new TTCMap('#map', { baseUrl, data, margin: {
                    top: 100,
                    bottom: 100,
                    left: 100,
                    right: 100,
                }});
        })
        .catch(console.error);
}

