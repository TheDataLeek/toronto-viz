import * as d3 from "d3";
import type { FetchResult } from './types';

const ONE_DAY_MS = 86_400_000;

interface CacheEntry<T> {
    ts: number;
    ttl: number | null;
    data: T;
}

export async function fetchJSON<T = unknown>(
    url: string,
    name: string,
    disableCache = false,
): Promise<FetchResult<T> | undefined> {
    let data: T;
    try {
        const cached = cacheGet<T>(name);
        if ((!disableCache) && cacheFresh(cached)) {
            data = cached!.data;
        } else {
            const fetched = await d3.json<T>(url);
            if (fetched === undefined) throw new Error(`Empty response from ${url}`);
            data = fetched;
            cacheSet(name, data, ONE_DAY_MS);
        }
        return { name, data };
    } catch (e) {
        console.error("Failed to fetch routes.", e);
    }
}

function cacheGet<T>(key: string): CacheEntry<T> | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as CacheEntry<T>;
    } catch { return null; }
}

function cacheSet<T>(key: string, value: T, ttlMs: number | null = null): void {
    try {
        localStorage.setItem(key, JSON.stringify({
            ts: Date.now(),
            ttl: ttlMs,
            data: value,
        }));
    } catch { /* storage full — silently skip */ }
}

function cacheFresh<T>(entry: CacheEntry<T> | null): boolean {
    if (!entry) return false;
    if (entry.ttl == null) return true;
    return (Date.now() - entry.ts) < entry.ttl;
}
