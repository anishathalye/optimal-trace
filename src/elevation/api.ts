const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';

const BATCH_SIZE = 90;

export interface ElevationPoint {
  lng: number;
  lat: number;
  elev: number;
  dist: number;
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function fetchElevationProfile(
  coords: [number, number][],
  signal?: AbortSignal
): Promise<ElevationPoint[]> {
  const samples = sampleCoords(coords, BATCH_SIZE * 5);
  const lats: number[] = [];
  const lngs: number[] = [];

  for (const [lng, lat] of samples) {
    lats.push(lat);
    lngs.push(lng);
  }

  const allElevations: number[] = [];

  for (let i = 0; i < lats.length; i += BATCH_SIZE) {
    const batchLats = lats.slice(i, i + BATCH_SIZE);
    const batchLngs = lngs.slice(i, i + BATCH_SIZE);
    const latStr = batchLats.map((v) => v.toFixed(6)).join(',');
    const lngStr = batchLngs.map((v) => v.toFixed(6)).join(',');

    const url = `${ELEVATION_URL}?latitude=${latStr}&longitude=${lngStr}`;
    const res = await fetch(url, { signal });

    if (!res.ok) {
      throw new Error(`Elevation API returned ${res.status}`);
    }

    const json = await res.json();
    const elevs: number[] = json.elevation ?? [];
    for (const e of elevs) {
      allElevations.push(e);
    }
  }

  const result: ElevationPoint[] = [];
  let cumDist = 0;

  for (let i = 0; i < samples.length; i++) {
    if (i > 0) {
      cumDist += haversineDistance(
        samples[i - 1][1], samples[i - 1][0],
        samples[i][1], samples[i][0]
      );
    }
    result.push({
      lng: samples[i][0],
      lat: samples[i][1],
      elev: allElevations[i] ?? 0,
      dist: cumDist,
    });
  }

  return result;
}

function sampleCoords(coords: [number, number][], maxPoints: number): [number, number][] {
  if (coords.length <= maxPoints) return coords;

  const step = (coords.length - 1) / (maxPoints - 1);
  const result: [number, number][] = [];

  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round(i * step);
    result.push(coords[Math.min(idx, coords.length - 1)]);
  }

  return result;
}
