const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 150;
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
): Promise<number[]> {
  const elevations: number[] = new Array(coords.length);

  for (let i = 0; i < coords.length; i += BATCH_SIZE) {
    const batch = coords.slice(i, Math.min(i + BATCH_SIZE, coords.length));
    const lats = batch.map(([, lat]) => lat.toFixed(6)).join(',');
    const lngs = batch.map(([lng]) => lng.toFixed(6)).join(',');

    if (i > 0) {
      await delay(BATCH_DELAY_MS);
    }

    const elevs = await fetchBatch(lats, lngs, signal);
    for (let j = 0; j < elevs.length; j++) {
      elevations[i + j] = elevs[j];
    }
  }

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
