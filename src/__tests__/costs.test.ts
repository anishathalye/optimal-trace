import { describe, it, expect } from 'vitest';
import {
  toblerSpeedKph,
  edgeMetrics,
  edgeWeight,
  directedEdgeCosts,
  routeMetrics,
  type ElevationLookup,
} from '../solver/costs';
import type { Edge } from '../graph/types';

function elevFromLng(lng: number): number {
  return lng * 10000;
}

const elev: ElevationLookup = (_lat, lng) => elevFromLng(lng);

describe('toblerSpeedKph', () => {
  it('is positive and bounded', () => {
    expect(toblerSpeedKph(0)).toBeGreaterThan(0);
    expect(toblerSpeedKph(0)).toBeLessThan(10);
  });

  it('is faster downhill than uphill at the same magnitude', () => {
    expect(toblerSpeedKph(-0.1)).toBeGreaterThan(toblerSpeedKph(0.1));
  });
});

describe('edgeMetrics', () => {
  it('computes length, ascent, and descent', () => {
    const edge: Edge = {
      from: 'a',
      to: 'b',
      weight: 0,
      coords: [
        [0, 0],
        [0.001, 0],
      ],
    };
    const metrics = edgeMetrics(edge, elev);
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics.ascent).toBeCloseTo(elevFromLng(0.001) - elevFromLng(0), 5);
    expect(metrics.descent).toBe(0);
  });
});

describe('edgeWeight', () => {
  const edge: Edge = {
    from: 'a',
    to: 'b',
    weight: 100,
    coords: [
      [0, 0],
      [0.001, 0],
    ],
  };

  it('returns distance for distance mode', () => {
    expect(edgeWeight(edge, 'distance', elev)).toBe(100);
  });

  it('returns elevation change for elevation mode', () => {
    expect(edgeWeight(edge, 'elevation', elev)).toBeCloseTo(
      elevFromLng(0.001) - elevFromLng(0),
      5,
    );
  });
});

describe('directedEdgeCosts', () => {
  const edge: Edge = {
    from: 'a',
    to: 'b',
    weight: 100,
    coords: [
      [0, 0],
      [0.001, 0],
    ],
  };

  it('is faster downhill than uphill', () => {
    const { forward, reverse } = directedEdgeCosts(edge, elev);
    expect(forward).toBeGreaterThan(0);
    expect(reverse).toBeGreaterThan(0);
    expect(reverse).toBeLessThan(forward);
  });
});

describe('routeMetrics', () => {
  it('reports equal ascent and descent for a closed out-and-back', () => {
    const coords: [number, number][] = [
      [0, 0],
      [0.001, 0],
      [0.002, 0],
      [0.001, 0],
      [0, 0],
    ];
    const metrics = routeMetrics(coords, elev);
    expect(metrics.ascent).toBeCloseTo(elevFromLng(0.002) - elevFromLng(0), 5);
    expect(metrics.descent).toBeCloseTo(metrics.ascent, 5);
    expect(metrics.time).toBeGreaterThan(0);
  });
});
