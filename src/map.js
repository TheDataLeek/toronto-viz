import * as d3 from 'd3';
import {Chart} from './charting.js';

const FETCH_INTERVAL = 30_000;

export class Map extends Chart {
    constructor(selector, params = {}) {
        super(selector, params);
        this.baseUrl = params.baseUrl || 'https://snek.taila15010.ts.net';
        this.vehicles = [];
        this.stops = null;
        this.speedColors = d3.scaleLinear(
            [0, 5, 10, 20, 30, 40, 50],
            ["#636e72", "#5b8dcc", "#10a090", "#20a060", "#c07a10", "#c83020", "#a00c18"]
        ).interpolate(d3.interpolateHcl).clamp(true)
        this.stopGroup = this.newGroup('stopGroup');
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

    async fetchStops() {
        try {
            if (!this.stops) {
                this.stops = await d3.json(`${this.baseUrl}/api/stops`);
                this.update()
            }
        } catch (e) {
            console.error("Failed to fetch stops.", e);
        }
    }

    async fetchVehicles() {
        try {
            this.data = await d3.json(`${this.baseUrl}/api/paths`);
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

        this.fetchStops()
        this.fetchVehicles();
        setInterval(() => {
            this.fetchVehicles()
            this.update()
        }, FETCH_INTERVAL);
    }

    update() {
        console.log({
            data: this.data,
            stops: this.stops
        })

        this.updateProjection()
        this.updateMetaText();
        this.updateStops()
        this.updateVehiclePoints()
    }

    updateProjection() {
        if (!this.stops) return;

        if (!this.resized && this.stops) {
            this.projection = this.projection
                .fitSize([this.width, this.height], this.stops)
            this.resized = true;
        }
    }

    updateMetaText() {
        const status = document.querySelector('#status');
        if (status) {
            status.textContent = `${this.vehicles.length} vehicles · ${new Date().toLocaleTimeString()}`;
        }
    }

    updateStops() {
        if (!this.stops) return;

        this.stops.features.forEach(d => {
            let coords = this.projection(d.geometry.coordinates)
            d.posX = coords[0];
            d.posY = coords[1];
        })

        this.stopGroup
            .selectAll('g')
            .data(this.stops.features, d => d.properties.stop_id)
            .join(
                enter => {
                    const g = enter.append('g')
                        .attr('opacity', 0)
                        .attr('d', d => `stop-${d.properties.stop_id}`);

                    g.append('circle')
                        .attr('cx', d => d.posX)
                        .attr('cy', d => d.posY)
                        .attr('r', 2)
                        .attr('stroke', 'white')
                        .attr('stroke-width', 0.25)
                        .attr('stroke-opacity', 0.1)
                        .attr('fill-opacity', 0.05)
                        .attr('fill', 'red');

                    g.transition()
                        .attr('opacity', 1);

                    return g
                }
            )

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
                        .attr('r', 1)
                        .attr('fill', d => this.speedColors(d.properties.avgSpeedKmHr || 0));

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
                        .attr('fill', d => this.speedColors(d.properties.avgSpeedKmHr || 0));

                    return update;
                },
                exit => {
                    return exit.remove()
                }
            )
    }
}
