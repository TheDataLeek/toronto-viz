import * as d3 from "d3";

function getThemeColor(varName) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(varName).trim();
}

export function buildTheme() {
    let theme = {
        bg:          getThemeColor('--color-bg'),
        routes:      getThemeColor('--color-routes'),
        stopsFill:   getThemeColor('--color-stops-fill'),
        stopsStroke: getThemeColor('--color-stops-stroke'),
        speedScale: [
            getThemeColor('--color-speed-0'),
            getThemeColor('--color-speed-5'),
            getThemeColor('--color-speed-15'),
            getThemeColor('--color-speed-30'),
            getThemeColor('--color-speed-50'),
        ],
    };

    theme.speedColorScale = d3.scaleLinear(
        [0, 5, 15, 30, 50],
        theme.speedScale
    ).interpolate(d3.interpolateHcl).clamp(true);

    return theme
}
