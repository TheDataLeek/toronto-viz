import * as d3 from 'd3';
import {Chart} from './charting.js';
import {fetchJSON} from './data'
import {buildTheme} from './theme.js';

const FETCH_INTERVAL = 30_000;
const MIN_STOP_ZOOM = 1.25;
const INTERACTION_STOP_ZOOM = 4;

export class Map extends Chart {
    /**
     * @param {string} selector - CSS selector for the container element
     * @param {object} params
     * @param {string} [params.baseUrl] - Base URL for API requests
     * @param {object} params.data - Pre-fetched GeoJSON keyed by 'ttc:paths', 'ttc:stops', 'ttc:routes'
     * @param {object} [params.margin] - Chart margins ({ top, bottom, left, right })
     */
    constructor(selector, params = {}) {
        super(selector, {renderer: 'canvas', ...params});
        this.baseUrl = params.baseUrl || 'https://snek.taila15010.ts.net';
        this.data = params.data;
        this.setupMap()
        this.init();
    }

    /**
     * Initializes map state, scales, projection, zoom behaviour, and attaches
     * the zoom handler to the canvas. Called once from the constructor before
     * {@link Chart#init}.
     */
    setupMap() {
        this.theme = buildTheme();
        this.vehicles = this.data['ttc:paths'];
        this.stops = this.data['ttc:stops'];
        this.routes = this.data['ttc:routes']
        this.stopPoints = [];
        this.vehicleGeometry = [];
        this.routePath = null;
        this.speedColors = d3.scaleLinear(
            [0, 5, 15, 30, 50],
            this.theme.speedScale
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
    }

    /**
     * Starts the periodic vehicle-location poll. Called once by {@link Chart#init}
     * after the initial resize/update cycle. Fires every {@link FETCH_INTERVAL} ms,
     * bypassing the local cache so each tick gets fresh data.
     */
    draw() {
        setInterval(() => {
            fetchJSON(`${this.baseUrl}/api/paths`, 'ttc:paths', true)
            .then(d => {
                if (!d) throw new Error('fetch returned empty response');
                this.vehicles = d.data;
                console.log(this.vehicles);
                this.update();
            })
            .catch(e => {
                console.error('Fetch failed:', e);
                const status = document.querySelector('#status');
                if (status) status.textContent = `Fetch failed · retrying in ${FETCH_INTERVAL / 1000}s`;
            })
        }, FETCH_INTERVAL);
    }

    /**
     * Full refresh: recomputes the projection, status text, and vehicle geometry,
     * then queues a canvas redraw. Called after each data fetch and on resize.
     */
    update() {
        this.updateProjection();
        this.updateMetaText();
        this.updateVehicleGeometry();
        this.scheduleRender();
    }

    /**
     * Fits the Mercator projection to the current canvas dimensions using the
     * stops GeoJSON as the bounding reference, then recomputes stop screen
     * coordinates, route paths, and vehicle geometry. Sets `this.resized = true`
     * so downstream geometry methods know the projection is ready.
     */
    updateProjection() {
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

    /** Updates the `#status` element with the current vehicle count and timestamp. */
    updateMetaText() {
        const status = document.querySelector('#status');
        if (status) {
            status.textContent = `${this.vehicles.features.length} vehicles · ${new Date().toLocaleTimeString()}`;
        }
    }

    /**
     * Coalesces multiple synchronous render requests into a single
     * `requestAnimationFrame` call. Safe to call repeatedly; only the first
     * call per frame has any effect.
     */
    scheduleRender() {
        if (this.renderQueued) return;
        this.renderQueued = true;

        requestAnimationFrame(() => {
            this.renderQueued = false;
            this.render();
        });
    }

    /**
     * Rebuilds `this.routePath` as a single composite `Path2D` from all route
     * features. Clears the path if routes are unavailable or the projection
     * hasn't been fitted yet.
     */
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

    /**
     * Projects each vehicle's path history and current position into screen
     * space, caching the results in `this.vehicleGeometry` for use by
     * {@link render}. No-ops until the projection has been fitted (`this.resized`).
     */
    updateVehicleGeometry() {
        if (!this.resized || !this.vehicles) {
            this.vehicleGeometry = [];
            return;
        }

        this.vehicleGeometry = this.vehicles.features.map(v => {
            const coords = v.geometry.coordinates;
            const lastCoord = coords?.[coords.length - 1];
            const point = lastCoord ? this.projection(lastCoord) : null;
            const historyPath = this.pathGenerator(v);

            if (!point || !historyPath) return null;

            return {
                color: this.speedColors(v.properties.avgSpeedKmHr || 0),
                history: new Path2D(historyPath),
                lastHeading: v.properties.lastHeading,
                point,
            };
        }).filter(Boolean);
    }

    /**
     * Returns the index stride for thinning stop rendering at low zoom levels.
     * Returns `Infinity` (skip all stops) below `MIN_STOP_ZOOM`, and triples
     * the stride during active pan/zoom gestures to reduce canvas work.
     * @param {number} scale - Current zoom scale (`transform.k`)
     * @returns {number} Stride value; `Infinity` means don't render stops at all
     */
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

    /**
     * Draws transit stops onto the canvas at the current zoom level, using
     * stride-based thinning (via {@link getStopStride}) to skip stops when
     * zoomed out or mid-gesture.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} scale - Current zoom scale (`transform.k`)
     */
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
        ctx.fillStyle = this.theme.stopsFill;
        ctx.globalAlpha = 0.15;
        ctx.fill();
        ctx.strokeStyle = this.theme.stopsStroke;
        ctx.lineWidth = 0.5 / scale;
        ctx.globalAlpha = 0.35;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    /**
     * Paints one frame: clears the canvas, then draws routes, stops, and
     * vehicles in layer order. Always called via {@link scheduleRender}, never directly.
     */
    render() {
        const {ctx} = this;
        const t = this.currentTransform;
        const canvasNode = this.canvas?.node();
        const canvasWidth = canvasNode?.width ?? this.containerWidth;
        const canvasHeight = canvasNode?.height ?? this.containerHeight;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = this.theme.bg;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.translate(t.x, t.y);
        ctx.scale(t.k, t.k);

        this.renderRoutes(ctx, t.k);
        this.renderStops(ctx, t.k);
        this.renderVehicles(ctx, t.k);

        ctx.restore();
    }

    /**
     * Draws the transit route network onto the canvas.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} scale - Current zoom scale (`transform.k`)
     */
    renderRoutes(ctx, scale) {
        if (!this.routePath) return;

        ctx.beginPath();
        ctx.strokeStyle = this.theme.routes;
        ctx.lineWidth = 0.5 / scale;
        ctx.globalAlpha = 0.1;
        ctx.stroke(this.routePath);
        ctx.globalAlpha = 1;
    }

    /**
     * Draws vehicles and their history trails onto the canvas. History trails
     * are suppressed during pan/zoom gestures below `INTERACTION_STOP_ZOOM`.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} scale - Current zoom scale (`transform.k`)
     */
    renderVehicles(ctx, scale) {
        if (!this.vehicleGeometry.length) return;

        const drawHistory = !this.isInteracting || scale >= INTERACTION_STOP_ZOOM;

        this.vehicleGeometry.forEach(vehicle => {
            if (drawHistory) {
                ctx.strokeStyle = vehicle.color;
                ctx.lineWidth = 1 / scale;
                ctx.globalAlpha = 0.5;
                ctx.stroke(vehicle.history);
            }

            const [x, y] = vehicle.point;
            ctx.fillStyle = vehicle.color;
            ctx.globalAlpha = 1;

            if (vehicle.lastHeading == null) {
                ctx.beginPath();
                ctx.arc(x, y, 3 / scale, 0, 2 * Math.PI);
                ctx.fill();
            } else {
                const size = 2.5 / scale;
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(vehicle.lastHeading * Math.PI / 180);
                ctx.beginPath();
                ctx.moveTo(0, -size * 1.8);   // tip (forward)
                ctx.lineTo(-size, size);       // back-left
                ctx.lineTo(size, size);        // back-right
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        });
    }

}
