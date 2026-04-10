import * as d3 from 'd3';
import { Chart } from './charting.js';

const FETCH_INTERVAL = 30_000;

export class Map extends Chart {
    constructor(selector, params = {}) {
        super(selector, params);
        this.apiUrl = params.apiUrl || 'https://snek.taila15010.ts.net/api/data';
        this.vehicles = [];
        this.speedColors = d3.scaleLinear([0, 5, 30, 100], ["#636e72", "#636e72", "#00b894", "#e17055"])
        this.newGroup('dots');
        this.projection = d3.geoMercator()

        this.init();
    }

    async fetchVehicles() {
        try {
            this.data = await d3.json(this.apiUrl);
            this.vehicles = this.data.features;
            this.update()
        } catch (e) {
            console.error('Fetch failed:', e);
            const status = document.querySelector('#status');
            if (status) status.textContent = 'Fetch failed · retrying in 60s';
        }
    }

    draw() {
        this.updateVehiclePoints()

        this.fetchVehicles();
        setInterval(() => {
            this.fetchVehicles()
            this.update()
        }, FETCH_INTERVAL);
    }

    update() {
        if (!this.data) return;

        this.projection = this.projection
            .fitSize([this.width, this.height], this.data)

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
        if (!this.vehicles.length) return;

        const project = d => this.projection(d.geometry.coordinates);

        const transition = this.svg.transition().duration(750);
        this.dots
            .selectAll('circle')
            .data(this.vehicles, d => d.properties.id)
            .join(
                enter => {
                    enter.append('circle')
                        .attr('cx', d => project(d)?.[0])
                        .attr('cy', d => project(d)?.[1])
                        .attr('r', 3)
                        .attr('fill', d => this.speedColors(d.properties.speedKmHr))
                        .attr('opacity', 0)
                        .call(enter =>
                            enter.transition(transition)
                                .attr('opacity', 0.8)
                        )
                },
                update => {
                    update.call(update =>
                        update.transition(transition)
                            .attr('cx', d => project(d)?.[0])
                            .attr('cy', d => project(d)?.[1])
                            .attr('fill', d => this.speedColors(d.properties.speedKmHr))
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
