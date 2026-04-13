import * as d3 from 'd3';
import { buildTheme } from './theme';
import { Chart } from './charting';
import type { Theme } from './types';

export class Colorbar extends Chart {
    private barHeight = 12;
    private tickLen   = 4;
    private labelPad  = 6;
    private theme: Theme;
    private stops: number[];

    constructor(selector: string, params: { margin?: { top?: number; bottom?: number; left?: number; right?: number } } = {}) {
        super(selector, params);

        this.theme = buildTheme();
        this.stops = [0, 5, 15, 30, 50];

        this.buildGradient();
        this.init();
    }

    private buildGradient(): void {
        const grad = this.defs
            .append('linearGradient')
            .attr('id', 'speed-gradient')
            .attr('x1', '0').attr('y1', '0')
            .attr('x2', '1').attr('y2', '0');

        this.stops.forEach((s, i) =>
            grad.append('stop')
                .attr('offset', `${(s / this.stops[this.stops.length - 1]) * 100}%`)
                .attr('stop-color', this.theme.speedScale[i])
        );
    }

    override draw(): void {
        const tickScale = d3.scaleLinear(
            [this.stops[0], this.stops[this.stops.length - 1]],
            [0, this.width],
        );

        this.newGroup('title')
            .append('text')
            .attr('x', this.width / 2)
            .attr('y', -4)
            .attr('text-anchor', 'middle')
            .attr('fill', 'var(--color-text-muted)')
            .style('font-size', '10px')
            .style('font-family', 'monospace')
            .text('km/h');

        this.newGroup('bar')
            .append('rect')
            .attr('width', this.width)
            .attr('height', this.barHeight)
            .attr('fill', 'url(#speed-gradient)');

        this.newGroup('ticks')
            .attr('transform', `translate(0, ${this.barHeight})`)
            .selectAll('g')
            .data(this.stops)
            .join(
                enter => {
                    const g = enter.append('g')
                        .attr('id', s => `colorBarTick-${s}`)
                        .attr('transform', s => `translate(${tickScale(s)}, 0)`);

                    g.append('line')
                        .attr('x1', 0)
                        .attr('x2', 0)
                        .attr('y1', 0)
                        .attr('y2', this.tickLen)
                        .attr('stroke', 'var(--color-text-muted)')
                        .attr('stroke-width', 1);

                    g.append('text')
                        .attr('x', 0)
                        .attr('y', this.tickLen + this.labelPad)
                        .attr('text-anchor', 'middle')
                        .attr('dominant-baseline', 'hanging')
                        .attr('fill', 'var(--color-text-muted)')
                        .style('font-size', '11px')
                        .style('font-family', 'monospace')
                        .text(s => s);

                    return g;
                },
            );
    }
}
