import * as d3 from 'd3';
import { Chart } from './charting.js';

const API_URL = 'https://snek.taila15010.ts.net/api/data';
const FETCH_INTERVAL = 60_000;

export class Map extends Chart {
    constructor(selector, params = {}) {
        super(selector, params);
        this.projection = d3.geoMercator()
            .center([-79.38, 43.72])
            .scale(80000);
        this.vehicles = [];
        this.init();
        this.startFetching();
    }

    async fetchVehicles() {
        try {
            const data = await d3.json(API_URL);
            this.vehicles = Array.isArray(data) ? data : [];
            this.update()
        } catch (e) {
            console.error('Fetch failed:', e);
            const status = document.querySelector('#status');
            if (status) status.textContent = 'Fetch failed · retrying in 60s';
        }
    }

    startFetching() {
        this.fetchVehicles();
        setInterval(() => {
            this.fetchVehicles()
            this.update()
        }, FETCH_INTERVAL);
    }

    draw() {
        this.projection.translate([this.width / 2, this.height / 2]);

        this.updateVehiclePoints()
    }

    update() {
        this.updateMetaText();
        this.updateVehiclePoints()
    }

    updateMetaText() {
        const status = document.querySelector('#status');
        if (status) {
            status.textContent = `${this.vehicles.length} vehicles · ${new Date().toLocaleTimeString()}`;
        }
    }

    updateVehiclePoints() {
        this.newGroup('dots')
            .selectAll('circle')
            .data(this.vehicles, d => d.id)
            .join('circle')
            .attr('cx', d => {
                const p = this.projection([+d.lon, +d.lat]);
                return p ? p[0] : null;
            })
            .attr('cy', d => {
                const p = this.projection([+d.lon, +d.lat]);
                return p ? p[1] : null;
            })
            .attr('r', 4)
            .attr('fill', '#4fc3f7')
            .attr('opacity', 0.8)
            .append('title')
            .text(d => `Route ${d.routeTag} · vehicle ${d.id}`);
    }
}
