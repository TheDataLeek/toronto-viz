import * as d3 from 'd3';
import {Chart} from './charting.js';

const FETCH_INTERVAL = 30_000;

export class Map extends Chart {
    constructor(selector, params = {}) {
        super(selector, { renderer: 'canvas', ...params });
        this.baseUrl = params.baseUrl || 'https://snek.taila15010.ts.net';
        this.vehicles = [];
        this.stops = null;
        this.routes = null;
        this.speedColors = d3.scaleLinear(
            [0, 5, 10, 20, 30, 40, 50],
            ["#636e72", "#5b8dcc", "#10a090", "#20a060", "#c07a10", "#c83020", "#a00c18"]
        ).interpolate(d3.interpolateHcl).clamp(true);
        this.projection = d3.geoMercator();
        this.currentTransform = d3.zoomIdentity;

        this.zoom = d3.zoom().on("zoom", e => {
            this.currentTransform = e.transform;
            this.render();
        });

        this.canvas
            .call(this.zoom)
            .call(this.zoom.transform, d3.zoomIdentity);

        this.resized = false;

        this.init();
    }

    async fetchRoutes() {
        try {
            if (!this.routes) {
                this.routes = await d3.json(`${this.baseUrl}/api/routes`);
                this.render();
            }
        } catch (e) {
            console.error("Failed to fetch routes.", e);
        }
    }

    async fetchStops() {
        try {
            if (!this.stops) {
                this.stops = await d3.json(`${this.baseUrl}/api/stops`);
                this.updateProjection();
                this.render();
            }
        } catch (e) {
            console.error("Failed to fetch stops.", e);
        }
    }

    async fetchVehicles() {
        try {
            this.data = await d3.json(`${this.baseUrl}/api/paths`);
            this.vehicles = this.data.features;
            this.update();
        } catch (e) {
            console.error('Fetch failed:', e);
            const status = document.querySelector('#status');
            if (status) status.textContent = 'Fetch failed · retrying in 60s';
        }
    }

    draw() {
        this.fetchRoutes();
        this.fetchStops();
        this.fetchVehicles();
        setInterval(() => {
            this.fetchVehicles();
        }, FETCH_INTERVAL);
    }

    update() {
        this.updateProjection();
        this.updateMetaText();
        this.render();
    }

    updateProjection() {
        if (!this.stops) return;

        if (!this.resized) {
            this.projection = this.projection
                .fitSize([this.width, this.height], this.stops);
            this.resized = true;
        }
    }

    updateMetaText() {
        const status = document.querySelector('#status');
        if (status) {
            status.textContent = `${this.vehicles.length} vehicles · ${new Date().toLocaleTimeString()}`;
        }
    }

    resize() {
        this.resized = false;
        super.resize();
    }

    render() {
        const { ctx, width, height } = this;
        const t = this.currentTransform;
        const path = d3.geoPath().projection(this.projection).context(ctx);

        ctx.save();
        ctx.clearRect(0, 0, width, height);
        ctx.translate(t.x, t.y);
        ctx.scale(t.k, t.k);

        // Routes
        if (this.routes && this.resized) {
            ctx.beginPath();
            this.routes.features.forEach(r => path(r));
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 0.5 / t.k;
            ctx.globalAlpha = 0.1;
            ctx.stroke();
        }

        // Stops
        if (this.stops) {
            ctx.lineWidth = 0.25 / t.k;
            this.stops.features.forEach(s => {
                const [x, y] = this.projection(s.geometry.coordinates);
                ctx.beginPath();
                ctx.arc(x, y, 2 / t.k, 0, 2 * Math.PI);
                ctx.fillStyle = 'red';
                ctx.globalAlpha = 0.05;
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.globalAlpha = 0.1;
                ctx.stroke();
            });
        }

        // Vehicles
        if (this.vehicles.length) {
            this.vehicles.forEach(v => {
                const color = this.speedColors(v.properties.avgSpeedKmHr || 0);
                const coords = v.geometry.coordinates;

                // history path
                ctx.beginPath();
                path(v);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1 / t.k;
                ctx.globalAlpha = 0.5;
                ctx.stroke();

                // current position dot
                const [x, y] = this.projection(coords[coords.length - 1]);
                ctx.beginPath();
                ctx.arc(x, y, 2 / t.k, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.globalAlpha = 1;
                ctx.fill();
            });
        }

        ctx.restore();
    }
}
