import * as d3 from 'd3';

export class Chart {
    constructor(selector, params={}) {
        // selector is just the selection string
        this.selector = selector;
        // svg is the d3 svg element
        this.svg = d3.select(selector).append('svg');
        // chart is the main group that we use for everything
        this.chart = this.svg.append('g');
        // margins are the empty space outside the chart
        this.margin = params.margin || {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
        };
    }

    get selected() {
        return document.querySelector(this.selector);
    }

    init() {
        // need to initialize chart initially
        this.resize();
        // and then initial draw for elements
        this.draw();
        // and on resize, redraw
        window.addEventListener('resize', () => {
            this.resize();
        });
    }

    draw() {
        // this is overridden by subclass
    }

    update() {
        // this is overridden by subclass
    }

    resize() {
        // calculates new dimensions and draws
        // https://bl.ocks.org/curran/3a68b0c81991e2e94b19
        this.containerWidth = this.selected.clientWidth;
        this.containerHeight = this.selected.clientHeight;

        this.width = this.containerWidth - this.margin.left - this.margin.right;
        this.height = this.containerHeight - this.margin.top - this.margin.bottom;

        this.svg
            .attr('width', this.containerWidth)
            .attr('height', this.containerHeight);

        this.chart
            .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`);

        this.update()
    }

    newGroup(name, parent=undefined) {
        if (parent === undefined) {
            this.chart.selectAll(`.${name}`).remove();
            this[name] = this.chart.append('g').classed(name, true);
            return this[name];
        } else {
            parent.selectAll(`.${name}`).remove();
            parent[name] = parent.append('g').classed(name, true);
            return parent[name];
        }
    }
}


