import { describe, it, expect } from 'vitest';
import { findAllIntersections } from '../graph/intersect';
import type { RawSegment } from '../graph/intersect';

describe('findAllIntersections', () => {
  it('returns empty for non-intersecting segments', () => {
    const segments: RawSegment[] = [
      { a: [0, 0], b: [1, 1], featureIdx: 0, segmentIdx: 0 },
      { a: [2, 2], b: [3, 3], featureIdx: 1, segmentIdx: 0 },
    ];
    expect(findAllIntersections(segments).size).toBe(0);
  });

  it('finds a crossing intersection', () => {
    const segments: RawSegment[] = [
      { a: [0, 0], b: [2, 2], featureIdx: 0, segmentIdx: 0 },
      { a: [0, 2], b: [2, 0], featureIdx: 1, segmentIdx: 0 },
    ];
    const result = findAllIntersections(segments);
    expect(result.size).toBeGreaterThanOrEqual(1);
  });

  it('finds T-junction intersection', () => {
    const segments: RawSegment[] = [
      { a: [0, 0], b: [2, 0], featureIdx: 0, segmentIdx: 0 },
      { a: [1, -1], b: [1, 1], featureIdx: 1, segmentIdx: 0 },
    ];
    const result = findAllIntersections(segments);
    expect(result.size).toBe(1);
  });

  it('does not flag parallel segments', () => {
    const segments: RawSegment[] = [
      { a: [0, 0], b: [2, 0], featureIdx: 0, segmentIdx: 0 },
      { a: [0, 0.5], b: [2, 0.5], featureIdx: 1, segmentIdx: 0 },
    ];
    expect(findAllIntersections(segments).size).toBe(0);
  });

  it('handles many segments', () => {
    const segments: RawSegment[] = [];
    for (let i = 0; i < 50; i++) {
      segments.push({
        a: [i * 0.01, 0],
        b: [i * 0.01, 1],
        featureIdx: i,
        segmentIdx: 0,
      });
    }
    for (let i = 0; i < 50; i++) {
      segments.push({
        a: [0, i * 0.01],
        b: [1, i * 0.01],
        featureIdx: 50 + i,
        segmentIdx: 0,
      });
    }
    const result = findAllIntersections(segments);
    expect(result.size).toBeGreaterThan(0);
  });

  it('finds intersection at shared endpoint', () => {
    const segments: RawSegment[] = [
      { a: [0, 0], b: [1, 0], featureIdx: 0, segmentIdx: 0 },
      { a: [1, 0], b: [1, 1], featureIdx: 1, segmentIdx: 0 },
    ];
    const result = findAllIntersections(segments);
    expect(result.size).toBeGreaterThanOrEqual(1);
  });
});
