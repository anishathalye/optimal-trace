import { describe, it, expect } from 'vitest';
import {
  smoothElevationProfile,
  routeMetrics,
  routeMetricsFromElevations,
  ELEVATION_SMOOTH_WINDOW_M,
  type ElevationLookup,
} from '../solver/costs';

function lineCoords(n: number, stepLng: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => [i * stepLng, 0]);
}

function ascentOf(elevs: number[]): number {
  let ascent = 0;
  for (let i = 1; i < elevs.length; i++) {
    const diff = elevs[i] - elevs[i - 1];
    if (diff > 0) ascent += diff;
  }
  return ascent;
}

// Deterministic pseudo-random noise in [-1.5, 1.5] meters.
function noisyElevation(i: number): number {
  return 100 + ((((i + 1) * 2654435761) >>> 0) % 3000) / 1000 - 1.5;
}

describe('smoothElevationProfile', () => {
  it('damps sample noise', () => {
    const coords = lineCoords(200, 0.0001);
    const noisy = coords.map((_, i) => noisyElevation(i));
    const smoothed = smoothElevationProfile(coords, noisy);

    const rawAscent = ascentOf(noisy);
    const smoothAscent = ascentOf(smoothed);

    expect(rawAscent).toBeGreaterThan(50);
    expect(smoothAscent).toBeLessThan(rawAscent / 2);
  });

  it('preserves a genuine sustained climb', () => {
    const coords = lineCoords(100, 0.0001);
    const climb = coords.map((_, i) => i);
    const smoothed = smoothElevationProfile(coords, climb);
    const gain = ascentOf(smoothed);

    expect(gain).toBeGreaterThan(90);
    expect(gain).toBeLessThanOrEqual(100);
  });

  it('returns the same values when points are farther apart than the window', () => {
    const coords = lineCoords(5, 0.001);
    const elevations = [0, 10, 20, 30, 40];
    const smoothed = smoothElevationProfile(coords, elevations);
    expect(smoothed).toEqual(elevations);
  });
});

describe('routeMetrics smoothing', () => {
  it('reports less ascent than raw sample-to-sample deltas', () => {
    const coords = lineCoords(200, 0.0001);
    const elevOf: ElevationLookup = (_lat, lng) =>
      noisyElevation(Math.round(lng / 0.0001));

    const metrics = routeMetrics(coords, elevOf);
    const rawAscent = ascentOf(coords.map((_, i) => noisyElevation(i)));

    expect(rawAscent).toBeGreaterThan(50);
    expect(metrics.ascent).toBeLessThan(rawAscent / 2);
    expect(ELEVATION_SMOOTH_WINDOW_M).toBeGreaterThan(0);
  });
});

describe('routeMetricsFromElevations', () => {
  it('matches routeMetrics for the same elevations', () => {
    const coords = lineCoords(200, 0.0001);
    const elevations = coords.map((_, i) => noisyElevation(i));
    const elevOf: ElevationLookup = (_lat, lng) =>
      elevations[Math.round(lng / 0.0001)];

    const fromArray = routeMetricsFromElevations(coords, elevations);
    const fromLookup = routeMetrics(coords, elevOf);

    expect(fromArray.ascent).toBeCloseTo(fromLookup.ascent, 6);
    expect(fromArray.descent).toBeCloseTo(fromLookup.descent, 6);
    expect(fromArray.time).toBeCloseTo(fromLookup.time, 6);
  });
});
