import type { Graph } from '../graph/types';

// USGS 3DEP bare-earth DEM via the ArcGIS ImageServer "identify" endpoint. It
// accepts a multipoint geometry (batch), requires no API key, and returns
// 1 m-resolution elevations with CORS enabled. Coverage is the US only;
// points outside coverage return "NoData" (mapped to 0 below).
const ELEVATION_URL =
  'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/identify';
const CACHE_STORAGE_KEY = 'optimal-trace-elevation-cache-v2';

const BATCH_SIZE = 100;
const RETRY_DELAY_MS = 2000;
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

export function parseElevationResults(json: unknown): number[] {
  const data = json as {
    results?: { value?: string }[];
    value?: string;
  };
  const entries = Array.isArray(data.results) ? data.results : [data];
  return entries.map((entry) => {
    const raw = entry.value;
    if (raw == null || raw === 'NoData') return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  });
}

async function fetchBatch(
  coords: [number, number][],
  signal?: AbortSignal,
): Promise<number[]> {
  const points = coords.map(([lng, lat]) => [lng, lat]);

  const body = new URLSearchParams();
  body.set('f', 'json');
  body.set('geometryType', 'esriGeometryMultipoint');
  body.set(
    'geometry',
    JSON.stringify({ points, spatialReference: { wkid: 4326 } }),
  );
  body.set('returnGeometry', 'false');

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(ELEVATION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal,
    });

    if (res.ok) {
      const json = await res.json();
      return parseElevationResults(json);
    }

    if (attempt === MAX_RETRIES) break;
    await delay(RETRY_DELAY_MS * (attempt + 1));
  }

  throw new Error('Elevation API request failed after retries');
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
    const batch = misses.slice(i, Math.min(i + BATCH_SIZE, misses.length));
    const batchCoords = batch.map((m) => [m.lng, m.lat] as [number, number]);

    const elevs = await fetchBatch(batchCoords, signal);
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

export async function fetchElevationForGraph(
  graph: Graph,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, number>> {
  const unique = new Map<string, [number, number]>();

  for (const edge of graph.edges) {
    for (const [lng, lat] of edge.coords) {
      const key = coordKey(lat, lng);
      if (!unique.has(key)) unique.set(key, [lng, lat]);
    }
  }

  for (const node of graph.nodes.values()) {
    const key = coordKey(node.lat, node.lng);
    if (!unique.has(key)) unique.set(key, [node.lng, node.lat]);
  }

  const coords = Array.from(unique.values());
  const elevations = await fetchElevationForAllCoords(
    coords,
    signal,
    onProgress,
  );

  const map = new Map<string, number>();
  for (let i = 0; i < coords.length; i++) {
    const [lng, lat] = coords[i];
    map.set(coordKey(lat, lng), elevations[i] ?? 0);
  }
  return map;
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
