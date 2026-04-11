import * as d3 from 'd3';
import {Chart} from './charting.js';

const FETCH_INTERVAL = 30_000;
const ONE_DAY_MS = 86_400_000;
const MIN_STOP_ZOOM = 1.25;
const INTERACTION_STOP_ZOOM = 4;
const MAP_BACKGROUND = '#111827';

function cacheGet(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch { return null; }
}

function cacheSet(key, value, ttlMs = null) {
    try {
        localStorage.setItem(key, JSON.stringify({
            ts: Date.now(),
            ttl: ttlMs,
            data: value,
        }));
    } catch { /* storage full — silently skip */ }
}

function cacheFresh(entry) {
    if (!entry) return false;
    if (entry.ttl == null) return true;
    return (Date.now() - entry.ts) < entry.ttl;
}

export class Map extends Chart {
    constructor(selector, params = {}) {
        super(selector, { renderer: 'canvas', ...params });
        this.baseUrl = params.baseUrl || 'https://snek.taila15010.ts.net';
        this.vehicles = [];
        this.stops = null;
        this.routes = null;
        this.stopPoints = [];
        this.vehicleGeometry = [];
        this.routePath = null;
        this.speedColors = d3.scaleLinear(
            [0, 5, 10, 20, 30, 40, 50],
            ["#636e72", "#5b8dcc", "#10a090", "#20a060", "#c07a10", "#c83020", "#a00c18"]
        ).interpolate(d3.interpolateHcl).clamp(true);
        this.projection = d3.geoMercator();
        this.pathGenerator = d3.geoPath().projection(this.projection);
        this.currentTransform = d3.zoomIdentity;
        this.isInteracting = false;
        this.renderQueued = false;

        this.zoom = d3.zoom()
            .on("start", () => {
                this.isInteracting = true;
                this.scheduleRender();
            })
            .on("zoom", e => {
                this.currentTransform = e.transform;
                this.scheduleRender();
            })
            .on("end", () => {
                this.isInteracting = false;
                this.scheduleRender();
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
                const cached = cacheGet('ttc:routes');
                if (cacheFresh(cached)) {
                    this.routes = cached.data;
                } else {
                    this.routes = await d3.json(`${this.baseUrl}/api/routes`);
                    cacheSet('ttc:routes', this.routes, ONE_DAY_MS);
                }
                this.updateRoutePath();
                this.scheduleRender();
            }
        } catch (e) {
            console.error("Failed to fetch routes.", e);
        }
    }

    async fetchStops() {
        try {
            if (!this.stops) {
                const cached = cacheGet('ttc:stops');
                if (cacheFresh(cached)) {
                    this.stops = cached.data;
                } else {
                    this.stops = await d3.json(`${this.baseUrl}/api/stops`);
                    cacheSet('ttc:stops', this.stops, ONE_DAY_MS);
                }
                this.updateProjection();
                this.scheduleRender();
            }
        } catch (e) {
            console.error("Failed to fetch stops.", e);
        }
    }

    async fetchVehicles() {
        try {
            this.data = await d3.json(`${this.baseUrl}/api/paths`);
            this.vehicles = this.data.features;
            cacheSet('ttc:vehicles', this.data);
            this.update();
        } catch (e) {
            console.error('Fetch failed:', e);
            const status = document.querySelector('#status');
            if (status) status.textContent = 'Fetch failed · retrying in 60s';
        }
    }

    draw() {
        const cachedVehicles = cacheGet('ttc:vehicles');
        if (cachedVehicles) {
            this.data = cachedVehicles.data;
            this.vehicles = this.data.features;
            this.updateVehicleGeometry();
        }

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
        this.updateVehicleGeometry();
        this.scheduleRender();
    }

    updateProjection() {
        if (!this.stops) return;

        if (!this.resized) {
            this.projection = this.projection
                .fitSize([this.width, this.height], this.stops);
            this.pathGenerator.projection(this.projection);
            this.stopPoints = this.stops.features
                .map(s => this.projection(s.geometry.coordinates))
                .filter(Boolean);
            this.resized = true;
            this.updateRoutePath();
            this.updateVehicleGeometry();
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

    scheduleRender() {
        if (this.renderQueued) return;
        this.renderQueued = true;

        requestAnimationFrame(() => {
            this.renderQueued = false;
            this.render();
        });
    }

    updateRoutePath() {
        if (!this.routes || !this.resized) {
            this.routePath = null;
            return;
        }

        const routePath = new Path2D();
        this.routes.features.forEach(route => {
            const pathData = this.pathGenerator(route);
            if (pathData) {
                routePath.addPath(new Path2D(pathData));
            }
        });
        this.routePath = routePath;
    }

    updateVehicleGeometry() {
        if (!this.resized || !this.vehicles.length) {
            this.vehicleGeometry = [];
            return;
        }

        this.vehicleGeometry = this.vehicles.map(v => {
            const coords = v.geometry.coordinates;
            const lastCoord = coords?.[coords.length - 1];
            const point = lastCoord ? this.projection(lastCoord) : null;
            const historyPath = this.pathGenerator(v);

            if (!point || !historyPath) return null;

            return {
                color: this.speedColors(v.properties.avgSpeedKmHr || 0),
                history: new Path2D(historyPath),
                point,
            };
        }).filter(Boolean);
    }

    getStopStride(scale) {
        if (scale < MIN_STOP_ZOOM) return Infinity;

        let stride = 1;
        if (scale < 2) stride = 12;
        else if (scale < 3) stride = 6;
        else if (scale < 5) stride = 3;

        if (this.isInteracting && scale < INTERACTION_STOP_ZOOM) {
            stride *= 3;
        }

        return stride;
    }

    renderStops(ctx, scale) {
        const stride = this.getStopStride(scale);
        if (!Number.isFinite(stride) || !this.stopPoints.length) return;

        const radius = 5 / scale;
        ctx.beginPath();
        for (let i = 0; i < this.stopPoints.length; i += stride) {
            const [x, y] = this.stopPoints[i];
            ctx.moveTo(x + radius, y);
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
        }
        ctx.fillStyle = 'red';
        ctx.globalAlpha = 0.05;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 0.25 / scale;
        ctx.globalAlpha = 0.1;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    render() {
        const { ctx } = this;
        const t = this.currentTransform;
        const canvasNode = this.canvas?.node();
        const canvasWidth = canvasNode?.width ?? this.containerWidth;
        const canvasHeight = canvasNode?.height ?? this.containerHeight;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = MAP_BACKGROUND;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.translate(t.x, t.y);
        ctx.scale(t.k, t.k);

        // Routes
        if (this.routePath) {
            ctx.beginPath();
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 0.5 / t.k;
            ctx.globalAlpha = 0.1;
            ctx.stroke(this.routePath);
            ctx.globalAlpha = 1;
        }

        // Stops
        this.renderStops(ctx, t.k);

        // Vehicles
        if (this.vehicleGeometry.length) {
            const drawHistory = !this.isInteracting || t.k >= INTERACTION_STOP_ZOOM;

            this.vehicleGeometry.forEach(vehicle => {
                if (drawHistory) {
                    ctx.strokeStyle = vehicle.color;
                    ctx.lineWidth = 1 / t.k;
                    ctx.globalAlpha = 0.5;
                    ctx.stroke(vehicle.history);
                }

                const [x, y] = vehicle.point;
                ctx.beginPath();
                ctx.arc(x, y, 3 / t.k, 0, 2 * Math.PI);
                ctx.fillStyle = vehicle.color;
                ctx.globalAlpha = 1;
                ctx.fill();
            });
        }

        ctx.restore();
    }
}
