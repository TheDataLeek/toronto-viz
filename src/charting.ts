import * as d3 from 'd3';
import Konva from "konva";
import type { Margins } from './types';

/**
 * Base class for all charts. Every instance creates two absolutely-positioned
 * child divs inside the container:
 *
 *   container (position: relative)
 *   ├── .chart-canvas  z-index:0  — Konva stage (canvas rendering)
 *   └── .chart-svg     z-index:1  — D3 SVG overlay (pointer-events: none)
 *
 * Both layers fill the container and share the same coordinate space. The SVG
 * is transparent and non-interactive by default; individual SVG elements can
 * opt back in with pointer-events:auto. Subclasses call syncSVGZoom() from
 * their zoom/pan handlers to keep the SVG transform in sync with the Konva
 * stage transform.
 *
 * ## Render pipeline
 *
 * Construction (synchronous):
 *   1. constructor() — builds DOM, creates Konva.Stage and D3 SVG
 *   2. subclass.setupMap() — creates Konva.Layers via newLayer(); each
 *      stage.add(layer) call queues a Konva batchDraw RAF internally
 *   3. init() → resize() → update() — fits projection, builds all shapes,
 *      calls layer.draw() synchronously to paint the canvas buffers
 *   4. init() → draw() → update() — second synchronous repaint (redundant
 *      but harmless; shapes are already built)
 *
 * Post-construction (one RAF later):
 *   5. requestAnimationFrame(() => stage.batchDraw()) — compositor flush
 *
 * ## Why the compositor flush is necessary
 *
 * Konva deduplicates draw requests via a _waitingForDraw flag per layer. All
 * batchDraw() calls that arrive before the first RAF fires are collapsed into
 * a single draw. This RAF is queued the moment the first layer is added in
 * setupMap(), long before any shapes exist.
 *
 * By step 3, all shapes are built and layer.draw() has painted the canvas
 * 2D contexts synchronously. However, the browser's compositor does not
 * necessarily flush canvas pixels to the display in the same task that drew
 * them — it waits until after the current call stack clears and the next
 * frame boundary. All of steps 1–4 run synchronously inside the Map
 * constructor call in index.js, so the browser never gets a chance to
 * composite until after the constructor returns.
 *
 * The extra RAF in step 5 fires after the JS call stack is clear, giving the
 * browser a proper frame boundary at which to composite the already-drawn
 * canvas pixels. Without it, the canvas appears blank until the next
 * externally-triggered redraw (user zoom, data refresh interval, etc.).
 */
export class Chart {
    protected selector: string;
    protected margin: Margins;
    protected stage: Konva.Stage;
    protected svg: d3.Selection<SVGSVGElement, unknown, d3.BaseType, unknown>;
    protected defs: d3.Selection<SVGDefsElement, unknown, d3.BaseType, unknown>;
    protected chart: d3.Selection<SVGGElement, unknown, d3.BaseType, unknown>;
    protected containerWidth!: number;
    protected containerHeight!: number;
    protected width!: number;
    protected height!: number;
    private resizeFrame: number | null = null;
    private handleResize: () => void;

    constructor(selector: string, params: { margin?: Partial<Margins> } = {}) {
        this.selector = selector;
        this.margin = { top: 0, bottom: 0, left: 0, right: 0, ...params.margin };

        const container = document.querySelector(selector) as HTMLElement;
        container.innerHTML = '';
        container.style.position = 'relative';

        // Canvas layer — Konva builds its own konvajs-content div inside here
        // with explicit pixel dimensions matching the stage width/height.
        const canvasDiv = document.createElement('div');
        canvasDiv.className = 'chart-canvas';
        canvasDiv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:0;';
        container.appendChild(canvasDiv);

        this.stage = new Konva.Stage({
            container: canvasDiv,
            width: container.clientWidth,
            height: container.clientHeight,
        });

        // SVG layer — sits above canvas, transparent and non-interactive by
        // default so all mouse/touch events fall through to Konva.
        const svgDiv = document.createElement('div');
        svgDiv.className = 'chart-svg';
        svgDiv.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none;';
        container.appendChild(svgDiv);

        this.svg = d3.select(svgDiv).append('svg')
            .attr('width', container.clientWidth)
            .attr('height', container.clientHeight) as unknown as d3.Selection<SVGSVGElement, unknown, d3.BaseType, unknown>;

        this.defs = this.svg.append('defs') as unknown as d3.Selection<SVGDefsElement, unknown, d3.BaseType, unknown>;
        // this.chart is the root <g> for D3 content. Its transform mirrors the
        // Konva stage transform; syncSVGZoom() keeps them in sync during
        // zoom/pan. On resize it resets to the margin translation.
        this.chart = this.svg.append('g').attr('class', 'chart')
            .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`);

        // Debounced resize: coalesce rapid window resize events into one call
        // per frame so projection fitting and shape rebuilds don't pile up.
        this.handleResize = () => {
            if (this.resizeFrame !== null) return;
            this.resizeFrame = requestAnimationFrame(() => {
                this.resizeFrame = null;
                this.resize();
            });
        };
    }

    protected get selected(): HTMLElement {
        return document.querySelector(this.selector) as HTMLElement;
    }

    /**
     * Called once at the end of the subclass constructor. Runs the initial
     * resize+draw, registers the window resize listener, then queues a
     * compositor-flush RAF (see class-level comment for why this is needed).
     */
    protected init(): void {
        this.resize();
        this.draw();
        window.addEventListener('resize', this.handleResize);
        // Compositor flush — see class-level comment for the full explanation.
        // TL;DR: canvas pixels painted synchronously during construction are
        // not composited to the display until after the JS call stack clears.
        // This RAF provides that frame boundary.
        requestAnimationFrame(() => this.stage.batchDraw());
    }

    draw(): void {}
    update(): void {}

    /**
     * Syncs container/stage/SVG dimensions and calls update() to rebuild
     * projection-dependent content. Called on init and debounced window resize.
     */
    resize(): void {
        const el = this.selected;
        this.containerWidth = el.clientWidth;
        this.containerHeight = el.clientHeight;
        this.width = this.containerWidth - this.margin.left - this.margin.right;
        this.height = this.containerHeight - this.margin.top - this.margin.bottom;

        this.stage.width(this.containerWidth);
        this.stage.height(this.containerHeight);
        this.svg
            .attr('width', this.containerWidth)
            .attr('height', this.containerHeight);
        // Reset to margin-only transform; syncSVGZoom() will re-apply the
        // full pan/scale transform once the subclass re-establishes zoom state.
        this.chart
            .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`);

        this.update();
    }

    /**
     * Creates or replaces a named <g> element in the SVG chart group.
     */
    protected newGroup(name: string): d3.Selection<SVGGElement, unknown, d3.BaseType, unknown> {
        this.chart.selectAll(`.${name}`).remove();
        return this.chart.append('g').classed(name, true);
    }

    /**
     * Creates a Konva.Layer and adds it to the stage.
     */
    protected newLayer(): Konva.Layer {
        const layer = new Konva.Layer();
        this.stage.add(layer);
        return layer;
    }

    /**
     * Applies the Konva stage's current pan/scale to the SVG chart group so
     * that SVG elements drawn in world (projection) coordinates stay aligned
     * with their canvas counterparts. Call this from zoom and drag handlers.
     *
     * Note: this replaces the margin-only transform set by resize(). SVG
     * elements should use projected world coordinates directly (margin is
     * already baked into the projection via fitExtent), not add the margin
     * themselves.
     */
    protected syncSVGZoom(scale: number, x: number, y: number): void {
        this.chart.attr('transform', `translate(${x}, ${y}) scale(${scale})`);
    }
}
