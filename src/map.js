import * as d3 from 'd3';
import {Chart} from './charting.js';

const FETCH_INTERVAL = 30_000;

export class Map extends Chart {
    constructor(selector, params = {}) {
        super(selector, params);
        this.apiUrl = params.apiUrl || 'https://snek.taila15010.ts.net/api/paths';
        this.vehicles = [];
        this.speedColors = d3.scaleLinear(
            [0, 5, 10, 20, 30, 40, 50],
            ["#636e72", "#5b8dcc", "#10a090", "#20a060", "#c07a10", "#c83020", "#a00c18"]
        ).interpolate(d3.interpolateHcl).clamp(true)
        this.vehicleGroup = this.newGroup('vehicleGroup');
        this.projection = d3.geoMercator()

        let transform;
        this.zoom = d3.zoom().on("zoom", e => {
            this.chart.attr("transform", (transform = e.transform));
            this.chart.style("stroke-width", 3 / Math.sqrt(transform.k));
        });

        this.svg
            .call(this.zoom)
            .call(this.zoom.transform, d3.zoomIdentity);

        this.resized = false;

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

        if (!this.resized && this.vehicles.length) {
            this.projection = this.projection
                .fitSize([this.width, this.height], this.data)
            this.resized = true;
        }

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

        this.vehicles.forEach((vehicle) => {
            let coords = vehicle.geometry.coordinates || [];
            let points = vehicle.points || [];

            vehicle.lineString = line(coords);
            vehicle.lastCoords = coords[coords.length - 1];
            vehicle.lastPoint = points[points.length - 1];
            vehicle.lastPos = this.projection(vehicle.lastCoords) || [null, null];
            vehicle.lastPosX = vehicle.lastPos[0];
            vehicle.lastPosY = vehicle.lastPos[1];
        })

        console.log(this.vehicles)

        this.vehicleGroup
            .selectAll('g')
            .data(this.vehicles, d => d.properties.id)
            .join(
                enter => {
                    const g = enter.append('g')
                        .attr('opacity', 0)
                        .attr('id', d => `vehicle-${d.properties.id}`);

                    g.append('path')
                        .attr('d', d => d.lineString)
                        .attr('fill', 'none')
                        .attr('stroke-width', 1)
                        .attr('stroke-opacity', 0.5)
                        .attr('stroke', d => this.speedColors(d.properties.avgSpeedKmHr || 0));

                    g.append('circle')
                        .attr('cx', d => d.lastPosX)
                        .attr('cy', d => d.lastPosY)
                        .attr('r', 2)
                        .attr('fill', d => this.speedColors(d.lastPoint.speedKmHr || 0));

                    g.transition().duration(750).attr('opacity', 1);

                    return g;
                },
                update => {
                    const t = update.transition().duration(750);

                    t.select('path')
                        .attr('stroke', d => this.speedColors(d.properties.avgSpeedKmHr || 0))
                        .attr('d', d => d.lineString);

                    t.select('circle')
                        .attr('cx', d => d.lastPosX)
                        .attr('cy', d => d.lastPosY)
                        .attr('fill', d => this.speedColors(d.lastPoint.speedKmHr || 0));

                    return update;
                },
                exit => {
                    return exit.remove()
                }
            )
    }
}
