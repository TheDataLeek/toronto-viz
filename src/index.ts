export { Chart } from './charting';
export { Map } from './map';
export { Colorbar } from './colorbar';
export * as d3 from 'd3';

import { Map as TTCMap } from './map';
import { Colorbar } from './colorbar';
import { fetchJSON } from './data';
import type { MapData, FeatureCollection, LineString, PathProperties } from './types';

const FETCH_INTERVAL = 30_000;

export function init({ baseUrl = '' } = {}): void {
    Promise.allSettled([
        fetchJSON<FeatureCollection<LineString>>(`${baseUrl}/api/routes`, 'ttc:routes'),
        fetchJSON<FeatureCollection<LineString>>(`${baseUrl}/api/stops`, 'ttc:stops'),
        fetchJSON<FeatureCollection<LineString, PathProperties>>(`${baseUrl}/api/paths`, 'ttc:paths', true),
    ])
        .then(results => {
            const failures = results.filter(r => r.status === 'rejected');
            if (failures.length) {
                failures.forEach(r => console.warn('Pre-fetch failed:', (r as PromiseRejectedResult).reason));
                const status = document.querySelector('#status');
                if (status) status.textContent = `${failures.length} data source(s) failed to load`;
                throw new Error(`${failures.length} pre-fetch(es) failed, aborting map init`);
            }

            const data = Object.fromEntries(
                results
                    .filter(r => r.status === 'fulfilled' && r.value)
                    .map(r => [(r as PromiseFulfilledResult<{ name: string; data: unknown }>).value.name,
                               (r as PromiseFulfilledResult<{ name: string; data: unknown }>).value.data])
            ) as unknown as MapData;

            console.log(data);

            const map = new TTCMap('#map', { baseUrl, data, margin: {
                top: 100,
                bottom: 100,
                left: 100,
                right: 100,
            }});

            new Colorbar('#colorbar', {
                margin: {
                    top: 12,
                    bottom: 24,
                    left: 8,
                    right: 8,
                },
            });

            const status = document.querySelector('#status');
            if (status) {
                status.textContent = `${data['ttc:paths'].features?.length} vehicles · ${new Date().toLocaleTimeString()}`;
            }

            setInterval(() => {
                fetchJSON<FeatureCollection<LineString, PathProperties>>(`${baseUrl}/api/paths`, 'ttc:paths', true)
                    .then(d => {
                        if (!d) throw new Error('fetch returned empty response');
                        const vehicleData = d.data;
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
