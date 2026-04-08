import { Chart } from './charting.js';

export class Map extends Chart {
    constructor(selector, params={}) {
        super(selector, params);
        this.init();
    }

}