import * as d3 from 'd3';
import { Chart } from './charting.js';

const FETCH_INTERVAL = 30_000;

export class Map extends Chart {
    constructor(selector, params = {}) {
        super(selector, params);
        this.apiUrl = params.apiUrl || 'https://snek.taila15010.ts.net/api/paths';
        this.vehicles = [];
        this.speedColors = d3.scaleLinear([0, 5, 30, 100], ["#636e72", "#636e72", "#00b894", "#e17055"])
        this.vehicleGroup = this.newGroup('vehicleGroup');
        this.projection = d3.geoMercator()

        this.init();
    }

    async fetchVehicles() {
        try {
            this.data = await d3.json(this.apiUrl);
            console.log(this.data)
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

        const line = d3.line()
            .x(d => this.projection(d)[0])
            .y(d => this.projection(d)[1])

        const transition = this.svg.transition().duration(750);

        this.vehicles.forEach((vehicle) => {
            let coords = vehicle.geometry.coordinates;
            vehicle.lineString = line(coords);
            // vehicle.lastCoords = coords[coords.length - 1];
            // let lastPos = this.projection(vehicle.lastCoords);
            // if (lastPos) {
            //     vehicle.lastPos = lastPos;
            //     if (vehicle.lastPos) {
            //         vehicle.lastPosX = this.lastPos[0];
            //         vehicle.lastPosY = this.lastPos[1];
            //     }
            // }
        })

        console.log(this.vehicles)

        this.vehicleGroup
            .selectAll('g')
            .data(this.vehicles, d => d.properties.id)
            .join(
                enter => {
                    let vehicleSubGroup = enter.append('g');

                    vehicleSubGroup.append('path')
                        .attr('d', d => d.lineString)
                        .attr('fill', 'none')
                        .attr('stroke-width', 1)
                        .attr('stroke-opacity', 0.8)
                        .attr('stroke', 'grey');

                    // vehicleSubGroup.append('circle')
                    //     .attr('cx', d => d.geometry.coordinates[d.geometry.coordinates.length - 1])
                    //     .attr('cy', d => project(d)?.[1])
                    //     .attr('r', 3)
                    //     .attr('fill', d => this.speedColors(d.properties.speedKmHr))
                    //     .attr('opacity', 0)
                    //     .call(enter =>
                    //         enter.transition(transition)
                    //             .attr('opacity', 0.8)
                    //     )
                },
                update => {
                    update.call(update =>
                        update.selectAll('path')
                            .transition(transition)
                            .attr('d', d => d.lineString)

                            // .attr('cx', d => project(d)?.[0])
                            // .attr('cy', d => project(d)?.[1])
                            // .attr('fill', d => this.speedColors(d.properties.speedKmHr))
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
