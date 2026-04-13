import * as d3 from "d3";
import type { Theme } from './types';

function getThemeColor(varName: string): string {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(varName).trim();
}

export function buildTheme(): Theme {
    const speedScale = [
        getThemeColor('--color-speed-0'),
        getThemeColor('--color-speed-5'),
        getThemeColor('--color-speed-15'),
        getThemeColor('--color-speed-30'),
        getThemeColor('--color-speed-50'),
    ];

    const speedColorScale = d3.scaleLinear<string>(
        [0, 5, 15, 30, 50],
        speedScale,
    ).interpolate(d3.interpolateHcl).clamp(true);

    return {
        bg:          getThemeColor('--color-bg'),
        routes:      getThemeColor('--color-routes'),
        stopsFill:   getThemeColor('--color-stops-fill'),
        stopsStroke: getThemeColor('--color-stops-stroke'),
        speedScale,
        speedColorScale,
    };
}
