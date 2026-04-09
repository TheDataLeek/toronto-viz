import * as d3 from 'd3';
import { Chart } from './charting.js';

const FETCH_INTERVAL = 30_000;

export class Map extends Chart {
    constructor(selector, params = {}) {
        super(selector, params);
        this.apiUrl = params.apiUrl || 'https://snek.taila15010.ts.net/api/data';
        this.vehicles = [];
        this.speedColors = d3.scaleLinear([0, 5, 50, 100], ["#636e72", "#636e72", "#00b894", "#e17055"])
        this.newGroup('dots');
        this.init();
    }

    async fetchVehicles() {
        try {
            const data = await d3.json(this.apiUrl);
            this.vehicles = Array.isArray(data) ? data : [];
            this.update()
        } catch (e) {
            console.error('Fetch failed:', e);
            const status = document.querySelector('#status');
            if (status) status.textContent = 'Fetch failed · retrying in 60s';
        }
    }

    draw() {
        this.projection = d3.geoMercator()
            .center([-79.38, 43.72])
            .scale(80000)
            .translate([this.width / 2, this.height / 2]);

        this.updateVehiclePoints()

        this.fetchVehicles();
        setInterval(() => {
            this.fetchVehicles()
            this.update()
        }, FETCH_INTERVAL);
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
        const transition = this.svg.transition().duration(750);
        this.dots
            .selectAll('circle')
            .data(this.vehicles, d => d.id)
            .join(
                enter => {
                    enter.append('circle')
                        .attr('cx', d => {
                            const p = this.projection([+d.lon, +d.lat]);
                            return p ? p[0] : null;
                        })
                        .attr('cy', d => {
                            const p = this.projection([+d.lon, +d.lat]);
                            return p ? p[1] : null;
                        })
                        .attr('r', 3)
                        .attr('fill', d => this.speedColors(d['speedKmHr']))
                        .attr('opacity', 0)
                        .call(enter =>
                            enter.transition(transition)
                                .attr('opacity', 0.8)
                        )
                },
                update => {
                    update.call(update =>
                        update.transition(transition)
                            .attr('cx', d => {
                                const p = this.projection([+d.lon, +d.lat]);
                                return p ? p[0] : null;
                            })
                            .attr('cy', d => {
                                const p = this.projection([+d.lon, +d.lat]);
                                return p ? p[1] : null;
                            })
                            .attr('fill', d => this.speedColors(d['speedKmHr']))
                    )
                },
                exit => {
                    exit.call(exit =>
                        exit.remove()
                    )
                },
            )
    }
}
