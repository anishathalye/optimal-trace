import type { Edge } from '../graph/types';
import { haversineDistance, coordKey } from '../utils/geo';

export type RoutingMode = 'distance' | 'elevation' | 'time';

export type SymmetricMode = 'distance' | 'elevation';

export type ElevationLookup = (lat: number, lng: number) => number;

const MIN_SPEED_MPS = 0.1;

// Horizontal moving-average window, used only for computing terrain grade (and
// hence grade-adjusted pace). Ascent/descent totals use the elevation
// threshold below instead.
export const ELEVATION_SMOOTH_WINDOW_M = 50;

// Trackpoint elevation threshold (GPS Visualizer / Strava-style). A gain or
// loss is only counted once the elevation has moved at least this far from the
// last "valid" point. This clips the small up/down jitter that DEM data
// contains, so noise is not accumulated into ascent/descent. USGS 3DEP (1 m
// posting, ~0.1-1 m vertical noise) needs only a few metres; larger values are
// more aggressive and filter out more small rollers.
export const ELEVATION_THRESHOLD_M = 2;

export function elevationGainLoss(
  elevations: number[],
  threshold = ELEVATION_THRESHOLD_M,
): { ascent: number; descent: number } {
  if (elevations.length === 0) return { ascent: 0, descent: 0 };

  let ascent = 0;
  let descent = 0;
  let baseline = elevations[0];

  for (let i = 1; i < elevations.length; i++) {
    const delta = elevations[i] - baseline;
    if (delta >= threshold) {
      ascent += delta;
      baseline = elevations[i];
    } else if (delta <= -threshold) {
      descent += -delta;
      baseline = elevations[i];
    }
  }

  return { ascent, descent };
}

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
  const coords = edge.coords;

  let length = 0;
  for (let i = 1; i < coords.length; i++) {
    length += haversineDistance(
      coords[i - 1][1],
      coords[i - 1][0],
      coords[i][1],
      coords[i][0],
    );
  }

  const elevations = new Array<number>(coords.length);
  for (let i = 0; i < coords.length; i++) {
    elevations[i] = elevOf(coords[i][1], coords[i][0]);
  }

  const { ascent, descent } = elevationGainLoss(elevations);
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
  const { ascent, descent } = elevationGainLoss(elevations);

  let time = 0;
  const elev = smoothElevationProfile(coords, elevations);
  const n = Math.min(coords.length, elev.length);
  for (let i = 1; i < n; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const length = haversineDistance(lat1, lng1, lat2, lng2);

    const grade = length > 0.001 ? (elev[i] - elev[i - 1]) / length : 0;
    const speedMps = Math.max(toblerSpeedKph(grade) / 3.6, MIN_SPEED_MPS);
    time += length / speedMps;
  }

  return { ascent, descent, time };
}
