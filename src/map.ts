import * as d3 from 'd3';
import Konva from 'konva';
import { Chart } from './charting';
import { buildTheme } from './theme';
import type { Theme, MapData, PathProperties, FeatureCollection, LineString, Point } from './types';

// d3.GeoPath has a `this` context type constraint on its call signature that
// conflicts with class method context. This interface exposes only what we
// need (call + projection setter) without that constraint.
interface GeoPathFn {
    (obj: d3.GeoPermissibleObjects): string | null;
    projection(proj: d3.GeoProjection | null): this;
}

const MIN_STOP_ZOOM = 1.25;
const INTERACTION_STOP_ZOOM = 4;
const ZOOM_FACTOR = 1.15;
const MIN_SCALE = 0.5;
const MAX_SCALE = 20;
const STOP_RADIUS = 2;   // screen pixels
const MARKER_RADIUS = 3; // screen pixels (dot)
const ARROW_SIZE = 2.5;  // screen pixels (triangle half-width)

interface VehicleGeometry {
    trail: Konva.Path;
    marker: Konva.Circle | Konva.Line;
}

interface MapParams {
    data: MapData;
    margin?: { top?: number; bottom?: number; left?: number; right?: number };
    baseUrl?: string;
}

/**
 * TTC vehicle map. Renders three Konva canvas layers (routes, stops, vehicles)
 * with a D3 SVG overlay for future annotations, all driven by a shared D3 zoom.
 *
 * ## Coordinate model
 *
 * All shapes are placed in "world coordinates" — the pixel space produced by
 * the D3 geoMercator projection. The projection is fitted via fitExtent() so
 * that the full stop extent lands within the margin-inset canvas bounds.
 * D3 zoom owns the viewport transform {k, x, y}; each zoom event pushes the
 * same values to both the Konva stage (via stage.scale/position, which Konva
 * applies as a CSS transform on the canvas layers) and to the SVG <g> via
 * syncSVGZoom(), keeping both layers perfectly aligned.
 *
 * ## Rendering optimisations
 *
 * Stops are rendered as a single Konva.Shape whose sceneFunc draws all circles
 * in one batched canvas path (one beginPath → N arc calls → one fill). Radius
 * and stride are read live inside sceneFunc so no per-zoom shape-property
 * updates are needed; a plain batchDraw() suffices.
 *
 * Zoom events push the CSS transform immediately (cheap) then schedule a
 * single RAF per frame to rescale vehicle markers and repaint canvas layers.
 * This collapses many pointermove events per frame into one canvas update.
 *
 * update() only rebuilds stops and routes when the container dimensions
 * change. Data-refresh calls (every 30s) skip straight to vehicle geometry.
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
 * current stage scale: radius = SCREEN_PX / scale. _rescaleShapes() applies
 * this to vehicle markers; stops compute it live inside their sceneFunc.
 */
export class Map extends Chart {
    private data: MapData;
    private theme!: Theme;
    private vehicles!: FeatureCollection<LineString, PathProperties>;
    private stops!: FeatureCollection<Point>;
    private routes!: FeatureCollection<LineString>;
    private vehicleGeometry: VehicleGeometry[] = [];
    private stopCoords: [number, number][] = [];
    private _zoomFrame: number | null = null;
    private _pendingScale = 1;
    private _lastWidth?: number;
    private _lastHeight?: number;
    private isInteracting = false;
    private projection!: d3.GeoProjection;
    private pathGenerator!: GeoPathFn;
    private zoom!: d3.ZoomBehavior<SVGSVGElement, unknown>;
    private routesLayer!: Konva.Layer;
    private stopsLayer!: Konva.Layer;
    private vehiclesLayer!: Konva.Layer;

    constructor(selector: string, params: MapParams) {
        super(selector, params);
        this.data = params.data;
        // setupMap() must run before init() so that layers exist when
        // init() → resize() → update() tries to populate them.
        this.setupMap();
        this.init();
        this._applyInitialMobileZoom();
    }

    /**
     * Initializes map state, projection, layers, and native zoom/pan handlers.
     * Called once from the constructor before {@link Chart#init}.
     */
    private setupMap(): void {
        this.theme = buildTheme();
        this.vehicles = this.data['ttc:paths'];
        this.stops = this.data['ttc:stops'];
        this.routes = this.data['ttc:routes'];

        this.projection = d3.geoMercator();
        this.pathGenerator = d3.geoPath().projection(this.projection) as unknown as GeoPathFn;

        // Three layers: routes (static), stops (stride-thinned), vehicles (live).
        // listening(false) on each layer disables Konva's hit canvas, saving
        // per-frame hit detection work for layers that have no interactions.
        // Side effect: each stage.add() + .listening(false) call queues a
        // Konva batchDraw RAF internally; the compositor-flush RAF in
        // Chart.init() handles making those visible (see Chart class comment).
        this.routesLayer = this.newLayer();
        this.routesLayer.listening(false);
        this.stopsLayer = this.newLayer();
        this.stopsLayer.listening(false);
        this.vehiclesLayer = this.newLayer();
        this.vehiclesLayer.listening(false);

        this.setupMapControls();
    }

    private setupMapControls(): void {
        this.zoom = d3.zoom<SVGSVGElement, unknown>()
            .scaleExtent([MIN_SCALE, MAX_SCALE])
            // One ZOOM_FACTOR step per wheel tick, matching the old Konva handler.
            .wheelDelta((event: WheelEvent) => (event.deltaY < 0 ? 1 : -1) * Math.log(ZOOM_FACTOR))
            .on('start', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
                this.isInteracting = true;
                // Hide trails during drag at low zoom — reduces canvas work when
                // thousands of path segments are being repainted every frame.
                // Wheel events skip this: they complete in one tick with no drag frames.
                const isDrag = (event.sourceEvent as Event | null)?.type !== 'wheel';
                if (isDrag && this.stage.scaleX() < INTERACTION_STOP_ZOOM) {
                    this.vehicleGeometry.forEach(({ trail }) => trail.visible(false));
                    this.vehiclesLayer.batchDraw();
                }
            })
            .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
                const { k, x, y } = event.transform;
                // CSS transform: cheap, update every event for smooth motion.
                this.stage.scale({ x: k, y: k });
                this.stage.position({ x, y });
                this.syncSVGZoom(k, x, y);
                // Canvas repaints: expensive, batch to one RAF per frame.
                this._pendingScale = k;
                if (!this._zoomFrame) {
                    this._zoomFrame = requestAnimationFrame(() => {
                        this._zoomFrame = null;
                        this._rescaleShapes(this._pendingScale);
                        this.stopsLayer.batchDraw();
                        this.vehiclesLayer.batchDraw();
                    });
                }
            })
            .on('end', () => {
                this.isInteracting = false;
                // Flush any pending RAF so end-state is painted immediately.
                if (this._zoomFrame !== null) {
                    cancelAnimationFrame(this._zoomFrame);
                    this._zoomFrame = null;
                }
                this.vehicleGeometry.forEach(({ trail }) => trail.visible(true));
                this._rescaleShapes(this.stage.scaleX());
                this._updateStopVisibility();
                this.vehiclesLayer.batchDraw();
            });

        // Enable pointer events on the SVG overlay so D3 zoom captures wheel
        // and drag gestures for both the canvas and SVG layers.
        this.svg.style('pointer-events', 'all');
        (this.svg as unknown as d3.Selection<SVGSVGElement, unknown, d3.BaseType, unknown>).call(this.zoom);
    }

    override draw(): void {
        this.update();
    }

    /**
     * Rebuilds shapes and repaints layers. Called by:
     *   - Chart.resize() on init and window resize (no vehicleData arg)
     *   - Chart.draw() on init (no vehicleData arg)
     *   - index.js interval every 30s with fresh vehicle GeoJSON
     *
     * When container dimensions have changed (resize path), the projection is
     * refitted and stops/routes are fully rebuilt. On data-refresh calls the
     * dimensions are the same, so only vehicle geometry is rebuilt.
     *
     * layer.draw() is used instead of batchDraw() so canvas buffers are
     * guaranteed to be painted before the function returns (batchDraw() would
     * be deduplicated into the pending RAF from setupMap() and might not fire
     * before the compositor-flush RAF in Chart.init() runs).
     */
    override update(vehicleData?: FeatureCollection<LineString, PathProperties>): void {
        if (vehicleData) this.vehicles = vehicleData;

        const w = this.containerWidth, h = this.containerHeight;
        if (w !== this._lastWidth || h !== this._lastHeight) {
            this._lastWidth = w;
            this._lastHeight = h;
            this.updateProjection();
            this._buildStopShapes();
            this.updateRoutes();
            this.routesLayer.draw();
            this.stopsLayer.draw();
        }

        this.updateVehicleGeometry();
        this.vehiclesLayer.draw();
    }

    /**
     * Refits the Mercator projection to the current canvas dimensions.
     * Re-applies the current D3 zoom transform to the SVG after the refit,
     * since Chart.resize() resets this.chart's transform to margin-only.
     */
    private updateProjection(): void {
        this.projection = this.projection.fitExtent(
            [[this.margin.left, this.margin.top],
             [this.containerWidth - this.margin.right, this.containerHeight - this.margin.bottom]],
            this.stops,
        );
        this.pathGenerator.projection(this.projection);
        const t = d3.zoomTransform(this.svg.node()!);
        this.syncSVGZoom(t.k, t.x, t.y);
    }

    /**
     * Rebuilds the routes layer from the routes GeoJSON. Each route feature
     * becomes a Konva.Path node. strokeScaleEnabled(false) keeps lines at a
     * constant screen-pixel width regardless of zoom. Called only on resize.
     */
    private updateRoutes(): void {
        if (!this.routes) return;

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
                fill: undefined,
            }));
        });
    }

    /**
     * Rebuilds vehicle trail paths and position markers. One Konva.Path per
     * trail, one Konva.Circle or Konva.Line (closed triangle) per vehicle
     * position. No-ops until the projection has been fitted.
     */
    private updateVehicleGeometry(): void {
        if (!this.vehicles?.features) {
            this.vehicleGeometry = [];
            return;
        }

        const scale = this.stage.scaleX();
        this.vehiclesLayer.destroyChildren();
        this.vehicleGeometry = [];

        this.vehicles.features.forEach(v => {
            const coords = v.geometry.coordinates;
            const lastCoord = coords[coords.length - 1] as [number, number] | undefined;
            const point = lastCoord ? this.projection(lastCoord) : null;
            const trailData = this.pathGenerator(v);
            if (!point || !trailData) return;

            const color = this.theme.speedColorScale(v.properties?.avgSpeedKmHr ?? 0);
            const [x, y] = point;

            const trail = new Konva.Path({
                data: trailData,
                stroke: color,
                strokeWidth: 1,
                strokeScaleEnabled: false,
                opacity: 0.5,
                listening: false,
                perfectDrawEnabled: false,
                fill: undefined,
            });
            this.vehiclesLayer.add(trail);

            let marker: Konva.Circle | Konva.Line;
            if (v.properties?.lastHeading != null) {
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
     * Drives the D3 zoom behavior with a transition so the zoom event fires
     * each frame, keeping both the Konva stage and SVG layer in sync.
     */
    zoomToCoords(longitude: number, latitude: number): void {
        const proj = this.projection([longitude, latitude]);
        if (!proj) return;
        const [px, py] = proj;
        const k = 2;
        const targetX = this.width / 2 - k * px;
        const targetY = this.height / 2 - k * py;
        (this.svg as unknown as d3.Selection<SVGSVGElement, unknown, d3.BaseType, unknown>)
            .transition().duration(750)
            .call(this.zoom.transform, d3.zoomIdentity.translate(targetX, targetY).scale(k));
    }

    /**
     * On mobile viewports (≤1000px wide), applies an initial zoom centered on
     * downtown Toronto so the opening view shows the core transit area rather
     * than the full system extent. No-ops on wider screens.
     */
    private _applyInitialMobileZoom(): void {
        if (!window.matchMedia('(max-width: 1000px)').matches) return;
        const proj = this.projection([-79.38, 43.65]);
        if (!proj) return;
        const [px, py] = proj;
        const k = 1.5;
        const tx = this.containerWidth / 2 - k * px;
        const ty = this.containerHeight / 2 - k * py;
        (this.svg as unknown as d3.Selection<SVGSVGElement, unknown, d3.BaseType, unknown>).call(
            this.zoom.transform,
            d3.zoomIdentity.translate(tx, ty).scale(k),
        );
    }

    /**
     * Returns the stop-rendering stride for the current zoom scale.
     * Higher stride = fewer stops shown. Returns Infinity below MIN_STOP_ZOOM.
     */
    private getStopStride(scale: number): number {
        if (scale < MIN_STOP_ZOOM) return Infinity;
        let stride = 1;
        if (scale < 2) stride = 12;
        else if (scale < 3) stride = 6;
        else if (scale < 5) stride = 3;
        if (this.isInteracting && scale < INTERACTION_STOP_ZOOM) stride *= 3;
        return stride;
    }

    /**
     * Rebuilds the stops layer as a single Konva.Shape whose sceneFunc draws
     * all circles in one batched canvas path. Radius and stride are read live
     * from the stage scale inside sceneFunc, so no per-zoom property updates
     * are needed — a plain batchDraw() is sufficient to trigger a repaint.
     * Called only on resize.
     */
    private _buildStopShapes(): void {
        this.stopCoords = this.stops.features
            .map(s => this.projection(s.geometry.coordinates as [number, number]))
            .filter((c): c is [number, number] => c !== null);

        this.stopsLayer.destroyChildren();
        this.stopsLayer.add(new Konva.Shape({
            fill: this.theme.stopsFill,
            opacity: 0.25,
            sceneFunc: (ctx: Konva.Context, shape: Konva.Shape) => {
                const scale = this.stage.scaleX();
                const stride = this.getStopStride(scale);
                if (!Number.isFinite(stride)) return;
                const r = STOP_RADIUS / scale;
                ctx.beginPath();
                for (let i = 0; i < this.stopCoords.length; i += stride) {
                    const [x, y] = this.stopCoords[i];
                    ctx.moveTo(x + r, y);
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                }
                ctx.fillShape(shape);
            },
            listening: false,
            perfectDrawEnabled: false,
        }));
    }

    /**
     * Triggers a repaint of the stops layer. The sceneFunc reads the current
     * scale and stride live, so no shape properties need to be updated first.
     */
    private _updateStopVisibility(): void {
        this.stopsLayer.batchDraw();
    }

    /**
     * Updates vehicle marker sizes so they remain constant in screen pixels as
     * the stage scale changes. Stop sizes are handled inside the sceneFunc and
     * need no explicit update here. Called from the zoom RAF and on zoom end.
     */
    private _rescaleShapes(scale: number): void {
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
