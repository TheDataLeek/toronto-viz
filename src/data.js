import * as d3 from "d3";

const ONE_DAY_MS = 86_400_000;

export async function fetchJSON(url, name, disableCache=false) {
    let data;
    try {
        const cached = cacheGet(name);
        if ((!disableCache) && cacheFresh(cached)) {
            data = cached.data;
        } else {
            data = await d3.json(url);
            cacheSet(name, data, ONE_DAY_MS);
        }
        return { name, data }
    } catch (e) {
        console.error("Failed to fetch routes.", e);
    }
}

function cacheGet(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch { return null; }
}

function cacheSet(key, value, ttlMs = null) {
    try {
        localStorage.setItem(key, JSON.stringify({
            ts: Date.now(),
            ttl: ttlMs,
            data: value,
        }));
    } catch { /* storage full — silently skip */ }
}

function cacheFresh(entry) {
    if (!entry) return false;
    if (entry.ttl == null) return true;
    return (Date.now() - entry.ts) < entry.ttl;
}

