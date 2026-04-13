import {Colorbar} from "./colorbar";

export { Chart } from './charting.js';
export { Map } from './map.js';
export { Colorbar } from './colorbar.js';
export * as d3 from 'd3';

import { Map as TTCMap } from './map.js';
import {fetchJSON} from './data'

const FETCH_INTERVAL = 30_000;

export function init({ baseUrl } = {}) {
    Promise.allSettled([
        fetchJSON(`${baseUrl}/api/routes`, 'ttc:routes'),
        fetchJSON(`${baseUrl}/api/stops`, 'ttc:stops'),
        fetchJSON(`${baseUrl}/api/paths`, 'ttc:paths', true),
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

            const map = new TTCMap('#map', { baseUrl, data, margin: {
                    top: 100,
                    bottom: 100,
                    left: 100,
                    right: 100,
                }});

            const scale = new Colorbar(
                "#colorbar",
                {
                    margin: {
                        top: 12,
                        bottom: 24,
                        left: 8,
                        right: 8,
                    }
                }
            );

            const status = document.querySelector('#status');
            if (status) {
                status.textContent = `${data['ttc:paths'].features?.length} vehicles · ${new Date().toLocaleTimeString()}`;
            }

            setInterval(() => {
                fetchJSON(`${baseUrl}/api/paths`, 'ttc:paths', true)
                    .then(d => {
                        if (!d) throw new Error('fetch returned empty response');
                        let vehicleData = d.data;
                        map.update(vehicleData);
                        const status = document.querySelector('#status');
                        if (status) {
                            status.textContent = `${vehicleData.features?.length} vehicles · ${new Date().toLocaleTimeString()}`;
                        }
                    })
                    .catch(e => {
                        console.error('Fetch failed:', e);
                        const status = document.querySelector('#status');
                        if (status) status.textContent = `Fetch failed · retrying in ${FETCH_INTERVAL / 1000}s`;
                    });
            }, FETCH_INTERVAL);
        })
        .catch(console.error);
}

