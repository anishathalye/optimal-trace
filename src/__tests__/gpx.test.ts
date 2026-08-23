import { describe, it, expect } from 'vitest';
import { haversineDistance } from '../utils/geo';
import {
  generateGPX,
  generateSplitGPX,
  splitRouteIndices,
  METERS_PER_MILE,
} from '../export/gpx';

const MILE = METERS_PER_MILE;

function lineCoords(numPoints: number, metersPerStep: number): [number, number][] {
  const degPerMeter = 1 / 111195;
  return Array.from(
    { length: numPoints },
    (_, i) => [0, i * metersPerStep * degPerMeter] as [number, number],
  );
}

function segmentDistance(
  coords: [number, number][],
  start: number,
  end: number,
): number {
  let d = 0;
  for (let i = start; i < end; i++) {
    d += haversineDistance(
      coords[i][1],
      coords[i][0],
      coords[i + 1][1],
      coords[i + 1][0],
    );
  }
  return d;
}

describe('splitRouteIndices', () => {
  it('returns an empty list for no coords', () => {
    expect(splitRouteIndices([], MILE)).toEqual([]);
  });

  it('returns a single range for a single point', () => {
    expect(splitRouteIndices([[0, 0]], MILE)).toEqual([[0, 0]]);
  });

  it('returns a single range when under the max distance', () => {
    const coords = lineCoords(4, MILE);
    expect(splitRouteIndices(coords, 10 * MILE)).toEqual([[0, 3]]);
  });

  it('does not split a single edge larger than the max distance', () => {
    const coords = lineCoords(2, 10 * MILE);
    expect(splitRouteIndices(coords, 4 * MILE)).toEqual([[0, 1]]);
  });

  it('splits a line into overlapping segments under the max distance', () => {
    const coords = lineCoords(11, MILE);
    const ranges = splitRouteIndices(coords, 4 * MILE);

    expect(ranges[0][0]).toBe(0);
    expect(ranges[ranges.length - 1][1]).toBe(coords.length - 1);
    expect(ranges.length).toBe(3);

    for (const [start, end] of ranges) {
      expect(segmentDistance(coords, start, end)).toBeLessThanOrEqual(
        4 * MILE + 1e-6,
      );
    }
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i][0]).toBe(ranges[i - 1][1]);
    }
  });
});

describe('generateSplitGPX', () => {
  it('produces a single file for a short route', () => {
    const coords = lineCoords(3, MILE);
    const gpxs = generateSplitGPX(coords, 'Route', 4);
    expect(gpxs).toHaveLength(1);
    expect(gpxs[0]).toContain('<name>Route</name>');
  });

  it('produces numbered files with overlapping trackpoints', () => {
    const coords = lineCoords(11, MILE);
    const gpxs = generateSplitGPX(coords, 'Route', 4);

    expect(gpxs.length).toBe(3);
    expect(gpxs[0]).toContain('<name>Route (1 of 3)</name>');
    expect(gpxs[1]).toContain('<name>Route (2 of 3)</name>');
    expect(gpxs[2]).toContain('<name>Route (3 of 3)</name>');

    const ranges = splitRouteIndices(coords, 4 * MILE);
    for (let i = 1; i < ranges.length; i++) {
      const prevEnd = coords[ranges[i - 1][1]];
      const nextStart = coords[ranges[i][0]];
      expect(prevEnd).toEqual(nextStart);
    }
  });

  it('carries elevations into each segment', () => {
    const coords = lineCoords(11, MILE);
    const elevations = coords.map((_, i) => 100 + i * 10);
    const gpxs = generateSplitGPX(coords, 'Route', 4, elevations);

    expect(gpxs).toHaveLength(3);
    for (const gpx of gpxs) {
      expect(gpx).toContain('<ele>');
    }
  });
});

describe('generateGPX', () => {
  it('escapes XML in the route name', () => {
    const gpx = generateGPX([[0, 0]], 'A & B <C>', [10]);
    expect(gpx).toContain('A &amp; B &lt;C&gt;');
    expect(gpx).not.toContain('A & B <C>');
  });
});
