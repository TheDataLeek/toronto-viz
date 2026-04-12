function getThemeColor(varName) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(varName).trim();
}

export function buildTheme() {
    return {
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
}
