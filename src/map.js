import * as d3 from 'd3';
import Konva from 'konva';
import { Chart } from './charting.js';
import { fetchJSON } from './data';
import { buildTheme } from './theme.js';

const MIN_STOP_ZOOM = 1.25;
const INTERACTION_STOP_ZOOM = 4;
const ZOOM_FACTOR = 1.15;
const MIN_SCALE = 0.5;
const MAX_SCALE = 20;
const STOP_RADIUS = 3;   // screen pixels
const MARKER_RADIUS = 3; // screen pixels (dot)
const ARROW_SIZE = 2.5;  // screen pixels (triangle half-width)

/**
 * TTC vehicle map. Renders three Konva canvas layers (routes, stops, vehicles)
 * with a D3 SVG overlay available for future annotations.
 *
 * ## Coordinate model
 *
 * All shapes are placed in "world coordinates" — the pixel space produced by
 * the D3 geoMercator projection. The projection is fitted via fitExtent() so
 * that the full stop extent lands within the margin-inset canvas bounds.
 * Konva's stage transform (scaleX/Y + x/y) is then used for zoom/pan; shapes
 * never move in world space, only the viewport changes. syncSVGZoom() keeps
 * the SVG <g> transform in sync with the stage transform so any SVG overlays
 * drawn in world coordinates stay aligned.
 *
 * ## Layer structure
 *
 *   routesLayer  — static TTC route lines; rebuilt only on resize
 *   stopsLayer   — stop circles; rebuilt on resize, visibility thinned by zoom
 *   vehiclesLayer — vehicle trail paths + position markers; rebuilt on each
 *                   data fetch (every 30s) and on resize
 *
 * All three layers have listening(false) — hit detection is disabled since
 * there is no per-shape interaction.
 *
 * ## Shape sizing
 *
 * Markers, stop circles, and arrow heads are sized in screen pixels (e.g.
 * STOP_RADIUS = 3px). Because shapes live in world coordinates and the stage
 * applies a uniform scale, their world-space radius must be divided by the
 * current stage scale: radius = SCREEN_PX / scale. _rescaleShapes() and
 * _buildStopShapes() apply this on every zoom change.
 */
export class Map extends Chart {
    /**
     * @param {string} selector - CSS selector for the container element
     * @param {object} params
     * @param {object} params.data - Pre-fetched GeoJSON keyed by 'ttc:paths', 'ttc:stops', 'ttc:routes'
     * @param {object} [params.margin] - Chart margins ({ top, bottom, left, right })
     */
    constructor(selector, params = {}) {
        super(selector, params);
        this.data = params.data;
        // setupMap() must run before init() so that layers exist when
        // init() → resize() → update() tries to populate them.
        this.setupMap();
        this.init();
    }

    /**
     * Initializes map state, projection, layers, and native zoom/pan handlers.
     * Called once from the constructor before {@link Chart#init}.
     */
    setupMap() {
        this.theme = buildTheme();
        this.vehicles = this.data['ttc:paths'];
        this.stops = this.data['ttc:stops'];
        this.routes = this.data['ttc:routes'];

        this.vehicleGeometry = [];
        this.stopCircles = [];
        this.isInteracting = false;
        this.resized = false;

        this.speedColors = d3.scaleLinear(
            [0, 5, 15, 30, 50],
            this.theme.speedScale
        ).interpolate(d3.interpolateHcl).clamp(true);

        this.projection = d3.geoMercator();
        this.pathGenerator = d3.geoPath().projection(this.projection);

        // Three layers: routes (static), stops (stride-thinned), vehicles (live).
        // listening(false) on each layer disables Konva's hit canvas, saving
        // per-frame hit detection work for layers that have no interactions.
        // Side effect: each stage.add() + .listening(false) call queues a
        // Konva batchDraw RAF internally; the compositor-flush RAF in
        // Chart.init() handles making those visible (see Chart class comment).
        this.newLayer('routesLayer').listening(false);
        this.newLayer('stopsLayer').listening(false);
        this.newLayer('vehiclesLayer').listening(false);

        this.setupMapControls();
    }

    setupMapControls() {
        // Konva native wheel zoom (zoom-to-pointer)
        this.stage.on('wheel', (e) => {
            e.evt.preventDefault();
            const oldScale = this.stage.scaleX();
            const pointer = this.stage.getPointerPosition();
            const mousePointTo = {
                x: (pointer.x - this.stage.x()) / oldScale,
                y: (pointer.y - this.stage.y()) / oldScale,
            };
            const direction = e.evt.deltaY < 0 ? 1 : -1;
            const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE,
                direction > 0 ? oldScale * ZOOM_FACTOR : oldScale / ZOOM_FACTOR
            ));
            this.stage.scale({ x: newScale, y: newScale });
            this.stage.position({
                x: pointer.x - mousePointTo.x * newScale,
                y: pointer.y - mousePointTo.y * newScale,
            });
            // Keep shape screen sizes constant and thin stop density by zoom level.
            this._rescaleShapes(newScale);
            this._updateStopVisibility();
            this.syncSVGZoom(newScale, this.stage.x(), this.stage.y());
        });

        // Konva native pan (stage drag)
        this.stage.draggable(true);
        this.stage.on('dragstart', () => {
            this.isInteracting = true;
            // Hide trails during drag at low zoom — reduces canvas work when
            // thousands of path segments are being repainted every frame.
            if (this.stage.scaleX() < INTERACTION_STOP_ZOOM) {
                this.vehicleGeometry.forEach(({ trail }) => trail.visible(false));
                this.vehiclesLayer.batchDraw();
            }
        });
        this.stage.on('dragend', () => {
            this.isInteracting = false;
            this.vehicleGeometry.forEach(({ trail }) => trail.visible(true));
            this._updateStopVisibility();
            this.vehiclesLayer.batchDraw();
            this.syncSVGZoom(this.stage.scaleX(), this.stage.x(), this.stage.y());
        });
    }

    draw() {
        this.update()
    }

    /**
     * Full rebuild: recomputes projection, recreates all shapes, and forces a
     * synchronous draw of all three layers. Called by:
     *   - Chart.resize() on init and window resize (no vehicleData arg)
     *   - Chart.draw() on init (no vehicleData arg)
     *   - index.js interval every 30s with fresh vehicle GeoJSON
     *
     * Render steps within update():
     *   1. updateProjection() — refit Mercator projection to current canvas size
     *   2. _buildStopShapes() — recreate stop circles in world coordinates
     *   3. updateRoutes()     — recreate route path nodes (skipped if !resized)
     *   4. updateVehicleGeometry() — recreate trail paths and position markers
     *   5. layer.draw() × 3  — synchronous canvas paint for each layer
     *
     * layer.draw() is used instead of batchDraw() so the canvas buffers are
     * guaranteed to be painted before the function returns. batchDraw() would
     * be deduplicated into the pending RAF from setupMap() and might not fire
     * before the compositor-flush RAF in Chart.init() runs.
     */
    update(vehicleData) {
        if (vehicleData) {
            this.vehicles = vehicleData;
        }

        this.updateProjection();
        this._buildStopShapes();
        this.updateRoutes();
        this.updateVehicleGeometry();
        this.routesLayer.draw();
        this.stopsLayer.draw();
        this.vehiclesLayer.draw();
    }

    /**
     * Fits the Mercator projection to the current canvas dimensions and
     * rebuilds stop shapes. Sets resized flag so route/vehicle rebuilds proceed.
     */
    updateProjection() {
        this.projection = this.projection.fitExtent(
            [[this.margin.left, this.margin.top],
             [this.containerWidth - this.margin.right, this.containerHeight - this.margin.bottom]],
            this.stops
        );
        this.pathGenerator.projection(this.projection);
        this.resized = true;
    }

    /**
     * Rebuilds the routes layer from the routes GeoJSON. Each route feature
     * becomes a Konva.Path node. strokeScaleEnabled(false) keeps lines at a
     * constant screen-pixel width regardless of zoom. Called only on resize.
     */
    updateRoutes() {
        if (!this.routes || !this.resized) return;

        this.routesLayer.destroyChildren();
        this.routes.features.forEach(route => {
            const pathData = this.pathGenerator(route);
            if (!pathData) return;
            this.routesLayer.add(new Konva.Path({
                data: pathData,
                stroke: this.theme.routes,
                strokeWidth: 0.5,
                strokeScaleEnabled: false,
                opacity: 0.1,
                listening: false,
                perfectDrawEnabled: false,
                fill: null,
            }));
        });
    }

    /**
     * Rebuilds vehicle trail paths and position markers. One Konva.Path per
     * trail, one Konva.Circle or Konva.Line (closed triangle) per vehicle
     * position. No-ops until the projection has been fitted.
     */
    updateVehicleGeometry() {
        if (!this.resized || !this.vehicles?.features) {
            this.vehicleGeometry = [];
            return;
        }

        const scale = this.stage.scaleX();
        this.vehiclesLayer.destroyChildren();
        this.vehicleGeometry = [];

        this.vehicles.features.forEach(v => {
            const coords = v.geometry.coordinates;
            const lastCoord = coords?.[coords.length - 1];
            const point = lastCoord ? this.projection(lastCoord) : null;
            const trailData = this.pathGenerator(v);
            if (!point || !trailData) return;

            const color = this.speedColors(v.properties.avgSpeedKmHr || 0);
            const [x, y] = point;

            const trail = new Konva.Path({
                data: trailData,
                stroke: color,
                strokeWidth: 1,
                strokeScaleEnabled: false,
                opacity: 0.5,
                listening: false,
                perfectDrawEnabled: false,
                fill: null,
            });
            this.vehiclesLayer.add(trail);

            let marker;
            if (v.properties.lastHeading != null) {
                const s = ARROW_SIZE / scale;
                marker = new Konva.Line({
                    x,
                    y,
                    points: [0, -s * 1.8, -s, s, s, s],
                    closed: true,
                    fill: color,
                    rotation: v.properties.lastHeading,
                    listening: false,
                    perfectDrawEnabled: false,
                });
            } else {
                marker = new Konva.Circle({
                    x,
                    y,
                    radius: MARKER_RADIUS / scale,
                    fill: color,
                    listening: false,
                    perfectDrawEnabled: false,
                });
            }
            this.vehiclesLayer.add(marker);

            this.vehicleGeometry.push({ trail, marker });
        });
    }

    /**
     * Animates the viewport to the given coordinates at zoom level 2.
     * Uses a Konva.Animation so the stage redraws all layers each frame.
     */
    zoomToCoords(longitude, latitude) {
        const [px, py] = this.projection([longitude, latitude]);
        const k = 2;
        const targetX = this.width / 2 - k * px;
        const targetY = this.height / 2 - k * py;
        const startX = this.stage.x();
        const startY = this.stage.y();
        const startK = this.stage.scaleX();
        const duration = 750;

        const anim = new Konva.Animation((frame) => {
            const t = Math.min(frame.time / duration, 1);
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out quad
            const currentScale = startK + (k - startK) * ease;
            this.stage.x(startX + (targetX - startX) * ease);
            this.stage.y(startY + (targetY - startY) * ease);
            this.stage.scaleX(currentScale);
            this.stage.scaleY(currentScale);
            this._rescaleShapes(currentScale);
            this.syncSVGZoom(currentScale, this.stage.x(), this.stage.y());
            if (t >= 1) anim.stop();
        }, [this.routesLayer, this.stopsLayer, this.vehiclesLayer]);

        anim.start();
    }

    /**
     * Returns the stop-rendering stride for the current zoom scale.
     * Higher stride = fewer stops shown. Returns Infinity below MIN_STOP_ZOOM.
     * @param {number} scale - Current stage scaleX
     */
    getStopStride(scale) {
        if (scale < MIN_STOP_ZOOM) return Infinity;
        let stride = 1;
        if (scale < 2) stride = 12;
        else if (scale < 3) stride = 6;
        else if (scale < 5) stride = 3;
        if (this.isInteracting && scale < INTERACTION_STOP_ZOOM) stride *= 3;
        return stride;
    }

    /**
     * Rebuilds the stops layer as individual Konva.Circle nodes, one per stop,
     * positioned in world (projection) space. Called on resize.
     */
    _buildStopShapes() {
        const scale = this.stage.scaleX();
        this.stopsLayer.destroyChildren();
        this.stopCircles = this.stops.features
            .map(s => this.projection(s.geometry.coordinates))
            .filter(Boolean)
            .map(([x, y]) => {
                const circle = new Konva.Circle({
                    x,
                    y,
                    radius: STOP_RADIUS / scale,
                    fill: this.theme.stopsFill,
                    stroke: this.theme.stopsStroke,
                    strokeWidth: 0.5,
                    strokeScaleEnabled: false,
                    opacity: 0.25,
                    listening: false,
                    perfectDrawEnabled: false,
                });
                this.stopsLayer.add(circle);
                return circle;
            });
        this._updateStopVisibility();
    }

    /**
     * Toggles stop circle visibility based on the current zoom stride.
     * Called on zoom changes and after drag ends.
     */
    _updateStopVisibility() {
        const scale = this.stage.scaleX();
        const stride = this.getStopStride(scale);
        const visible = Number.isFinite(stride);
        this.stopCircles.forEach((circle, i) => {
            circle.visible(visible && i % stride === 0);
        });
        this.stopsLayer.batchDraw();
    }

    /**
     * Updates all shape sizes so they remain constant in screen pixels as the
     * stage scale changes. Called on wheel zoom and during zoomToCoords animation.
     * @param {number} scale - Current stage scaleX
     */
    _rescaleShapes(scale) {
        this.stopCircles.forEach(c => c.radius(STOP_RADIUS / scale));
        this.vehicleGeometry.forEach(({ marker }) => {
            if (marker instanceof Konva.Circle) {
                marker.radius(MARKER_RADIUS / scale);
            } else {
                const s = ARROW_SIZE / scale;
                marker.points([0, -s * 1.8, -s, s, s, s]);
            }
        });
    }
}
