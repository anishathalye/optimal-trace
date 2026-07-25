import { describe, it, expect } from 'vitest';
import { haversineDistance, trailDistance, filterByMinLength } from '../utils/geo';

describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistance(40, -105, 40, -105)).toBe(0);
  });

  it('computes distance between two points', () => {
    const d = haversineDistance(40, -105, 41, -105);
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });

  it('is symmetric', () => {
    const d1 = haversineDistance(40, -105, 40.1, -105.1);
    const d2 = haversineDistance(40.1, -105.1, 40, -105);
    expect(d1).toBeCloseTo(d2, 6);
  });
});

describe('trailDistance', () => {
  it('returns 0 for empty features', () => {
    expect(trailDistance({ features: [] })).toBe(0);
  });

  it('sums LineString distances', () => {
    const trails = {
      features: [
        {
          geometry: {
            type: 'LineString' as const,
            coordinates: [[0, 0], [0, 1], [0, 2]] as [number, number][],
          },
          properties: {},
        },
      ],
    };
    const d = trailDistance(trails);
    expect(d).toBeGreaterThan(0);
  });

  it('ignores non-LineString features', () => {
    const trails = {
      features: [
        {
          geometry: { type: 'Point' as const, coordinates: [0, 0] as [number, number] },
          properties: {},
        },
      ],
    };
    expect(trailDistance(trails)).toBe(0);
  });
});

describe('filterByMinLength', () => {
  it('returns all features when minLength is 0', () => {
    const features = [
      { geometry: { type: 'LineString' as const, coordinates: [[0, 0], [0, 1]] as [number, number][] }, properties: {} },
    ];
    expect(filterByMinLength(features, 0).length).toBe(1);
  });

  it('filters out short segments', () => {
    const features = [
      { geometry: { type: 'LineString' as const, coordinates: [[0, 0], [0, 0.00001]] as [number, number][] }, properties: {} },
    ];
    expect(filterByMinLength(features, 100).length).toBe(0);
  });
});
