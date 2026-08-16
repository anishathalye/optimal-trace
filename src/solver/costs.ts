import type { Edge } from '../graph/types';
import { haversineDistance, coordKey } from '../utils/geo';

export type RoutingMode = 'distance' | 'elevation' | 'time';

export type SymmetricMode = 'distance' | 'elevation';

export type ElevationLookup = (lat: number, lng: number) => number;

const MIN_SPEED_MPS = 0.1;

// Raw DEM elevations contain per-sample noise that inflates summed ascent and
// descent (and the grades used for pace). A moving average over horizontal
// distance damps that noise while preserving real, longer climbs.
export const ELEVATION_SMOOTH_WINDOW_M = 50;

// Tobler's hiking function: speed (km/h) as a function of terrain slope.
// grade is rise/run (tangent of the slope angle). The +0.05 term encodes the
// observation that a slight downhill is faster than flat ground.
export function toblerSpeedKph(grade: number): number {
  return 6 * Math.exp(-3.5 * Math.abs(grade + 0.05));
}

export function smoothElevationProfile(
  coords: [number, number][],
  elevations: number[],
  windowMeters = ELEVATION_SMOOTH_WINDOW_M,
): number[] {
  const n = Math.min(coords.length, elevations.length);
  if (n === 0) return [];
  if (n === 1) return [elevations[0]];

  const cumDist = new Array<number>(n);
  cumDist[0] = 0;
  for (let i = 1; i < n; i++) {
    cumDist[i] =
      cumDist[i - 1] +
      haversineDistance(
        coords[i - 1][1],
        coords[i - 1][0],
        coords[i][1],
        coords[i][0],
      );
  }

  const half = windowMeters / 2;
  const smoothed = new Array<number>(n);
  let left = 0;
  let right = 0;
  let sum = 0;

  for (let i = 0; i < n; i++) {
    while (left < i && cumDist[i] - cumDist[left] > half) {
      sum -= elevations[left];
      left++;
    }
    while (right < n && cumDist[right] - cumDist[i] <= half) {
      sum += elevations[right];
      right++;
    }
    smoothed[i] = sum / (right - left);
  }

  return smoothed;
}

function smoothedElevation(
  coords: [number, number][],
  elevOf: ElevationLookup,
): number[] {
  const raw = new Array<number>(coords.length);
  for (let i = 0; i < coords.length; i++) {
    raw[i] = elevOf(coords[i][1], coords[i][0]);
  }
  return smoothElevationProfile(coords, raw);
}

export interface EdgeMetrics {
  length: number;
  ascent: number;
  descent: number;
}

export function edgeMetrics(edge: Edge, elevOf: ElevationLookup): EdgeMetrics {
  let length = 0;
  let ascent = 0;
  let descent = 0;

  const coords = edge.coords;
  const elev = smoothedElevation(coords, elevOf);
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    length += haversineDistance(lat1, lng1, lat2, lng2);

    const diff = elev[i] - elev[i - 1];
    if (diff > 0) ascent += diff;
    else descent += -diff;
  }

  return { length, ascent, descent };
}

function directedTime(
  coords: [number, number][],
  elevOf: ElevationLookup,
): number {
  let time = 0;
  const elev = smoothedElevation(coords, elevOf);

  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const length = haversineDistance(lat1, lng1, lat2, lng2);

    const grade = length > 0.001 ? (elev[i] - elev[i - 1]) / length : 0;
    const speedMps = Math.max(toblerSpeedKph(grade) / 3.6, MIN_SPEED_MPS);
    time += length / speedMps;
  }

  return time;
}

// Symmetric edge cost used as the objective for the CPP matching. For a
// closed route, total ascent equals total descent, so "elevation change"
// (ascent + descent) is equivalent to minimizing total climbing.
export function edgeWeight(
  edge: Edge,
  mode: SymmetricMode,
  elevOf: ElevationLookup,
): number {
  if (mode === 'distance') return edge.weight;

  const metrics = edgeMetrics(edge, elevOf);
  return metrics.ascent + metrics.descent;
}

export interface DirectedEdgeCosts {
  forward: number;
  reverse: number;
}

// Grade-adjusted travel time (seconds) in each direction. Asymmetric because
// Tobler's function models downhill as faster than uphill.
export function directedEdgeCosts(
  edge: Edge,
  elevOf: ElevationLookup,
): DirectedEdgeCosts {
  return {
    forward: directedTime(edge.coords, elevOf),
    reverse: directedTime([...edge.coords].reverse(), elevOf),
  };
}

export function elevationLookupFromMap(
  map: Map<string, number>,
): ElevationLookup {
  return (lat, lng) => map.get(coordKey(lat, lng)) ?? 0;
}

export interface RouteMetrics {
  ascent: number;
  descent: number;
  time: number;
}

export function routeMetrics(
  coords: [number, number][],
  elevOf: ElevationLookup,
): RouteMetrics {
  const raw = new Array<number>(coords.length);
  for (let i = 0; i < coords.length; i++) {
    raw[i] = elevOf(coords[i][1], coords[i][0]);
  }
  return routeMetricsFromElevations(coords, raw);
}

export function routeMetricsFromElevations(
  coords: [number, number][],
  elevations: number[],
): RouteMetrics {
  let ascent = 0;
  let descent = 0;
  let time = 0;

  const elev = smoothElevationProfile(coords, elevations);
  const n = Math.min(coords.length, elev.length);
  for (let i = 1; i < n; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const length = haversineDistance(lat1, lng1, lat2, lng2);

    const diff = elev[i] - elev[i - 1];
    if (diff > 0) ascent += diff;
    else descent += -diff;

    const grade = length > 0.001 ? diff / length : 0;
    const speedMps = Math.max(toblerSpeedKph(grade) / 3.6, MIN_SPEED_MPS);
    time += length / speedMps;
  }

  return { ascent, descent, time };
}
