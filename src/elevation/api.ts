const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';
const CACHE_STORAGE_KEY = 'optimal-trace-elevation-cache';

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 2000;
const MAX_RETRIES = 3;

export interface ElevationPoint {
  lng: number;
  lat: number;
  elev: number;
  dist: number;
}

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let elevationCache: Map<string, number> | null = null;

function loadCache(): Map<string, number> {
  if (elevationCache) return elevationCache;
  try {
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (raw) {
      const obj: Record<string, number> = JSON.parse(raw);
      elevationCache = new Map(Object.entries(obj));
      return elevationCache;
    }
  } catch {
    /* ignore */
  }
  elevationCache = new Map();
  return elevationCache;
}

function persistCache() {
  try {
    const obj: Record<string, number> = {};
    for (const [k, v] of loadCache()) {
      obj[k] = v;
    }
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* ignore - storage full or unavailable */
  }
}

function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(7)},${lng.toFixed(7)}`;
}

async function fetchBatch(
  lats: string,
  lngs: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const url = `${ELEVATION_URL}?latitude=${lats}&longitude=${lngs}`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, { signal });

    if (res.ok) {
      const json = await res.json();
      return (json.elevation ?? []) as number[];
    }

    if (res.status !== 429) {
      throw new Error(`Elevation API returned ${res.status}`);
    }

    if (attempt === MAX_RETRIES) break;

    const retryAfter = res.headers.get('Retry-After');
    const waitMs = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : BATCH_DELAY_MS * (attempt + 1);
    await delay(waitMs);
  }

  throw new Error('Elevation API rate limited after retries');
}

export async function fetchElevationForAllCoords(
  coords: [number, number][],
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<number[]> {
  const elevations: number[] = new Array(coords.length);
  const cache = loadCache();
  const misses: { idx: number; lat: number; lng: number }[] = [];

  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i];
    const key = coordKey(lat, lng);
    const cached = cache.get(key);
    if (cached !== undefined) {
      elevations[i] = cached;
    } else {
      misses.push({ idx: i, lat, lng });
    }
  }

  if (misses.length === 0) {
    onProgress?.(coords.length, coords.length);
    return elevations;
  }

  for (let i = 0; i < misses.length; i += BATCH_SIZE) {
    if (i > 0) {
      await delay(BATCH_DELAY_MS);
    }

    const batch = misses.slice(i, Math.min(i + BATCH_SIZE, misses.length));
    const lats = batch.map((m) => m.lat.toFixed(6)).join(',');
    const lngs = batch.map((m) => m.lng.toFixed(6)).join(',');

    const elevs = await fetchBatch(lats, lngs, signal);
    for (let j = 0; j < elevs.length; j++) {
      const { idx, lat, lng } = batch[j];
      elevations[idx] = elevs[j];
      cache.set(coordKey(lat, lng), elevs[j]);
    }
    persistCache();

    const resolved = coords.length - misses.length + i + elevs.length;
    onProgress?.(resolved, coords.length);
  }

  onProgress?.(coords.length, coords.length);
  return elevations;
}

export function buildElevationProfile(
  coords: [number, number][],
  elevations: number[],
): ElevationPoint[] {
  const result: ElevationPoint[] = [];
  let cumDist = 0;

  for (let i = 0; i < coords.length; i++) {
    if (i > 0) {
      cumDist += haversineDistance(
        coords[i - 1][1],
        coords[i - 1][0],
        coords[i][1],
        coords[i][0],
      );
    }
    result.push({
      lng: coords[i][0],
      lat: coords[i][1],
      elev: elevations[i] ?? 0,
      dist: cumDist,
    });
  }

  return result;
}
