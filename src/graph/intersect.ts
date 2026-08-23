import { pointKey } from './types';

export type Point = [number, number];

function intersectionPoint(
  a1: Point,
  a2: Point,
  b1: Point,
  b2: Point,
): Point | null {
  const dx1 = a2[0] - a1[0];
  const dy1 = a2[1] - a1[1];
  const dx2 = b2[0] - b1[0];
  const dy2 = b2[1] - b1[1];

  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-12) return null;

  const t = ((b1[0] - a1[0]) * dy2 - (b1[1] - a1[1]) * dx2) / denom;
  const u = ((b1[0] - a1[0]) * dy1 - (b1[1] - a1[1]) * dx1) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return [a1[0] + t * dx1, a1[1] + t * dy1];
  }

  return null;
}

export interface RawSegment {
  a: Point;
  b: Point;
  featureIdx: number;
  segmentIdx: number;
}

function bbox(
  a: Point,
  b: Point,
): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: Math.min(a[0], b[0]),
    maxX: Math.max(a[0], b[0]),
    minY: Math.min(a[1], b[1]),
    maxY: Math.max(a[1], b[1]),
  };
}

function bboxesOverlap(
  b1: ReturnType<typeof bbox>,
  b2: ReturnType<typeof bbox>,
): boolean {
  return (
    b1.minX <= b2.maxX &&
    b1.maxX >= b2.minX &&
    b1.minY <= b2.maxY &&
    b1.maxY >= b2.minY
  );
}

export interface IntersectionGroup {
  point: Point;
  segs: number[];
}

export function findAllIntersections(
  segments: RawSegment[],
): Map<string, IntersectionGroup> {
  const intersections = new Map<string, IntersectionGroup>();

  const boxes = segments.map((s) => bbox(s.a, s.b));

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (!bboxesOverlap(boxes[i], boxes[j])) continue;

      const pt = intersectionPoint(
        segments[i].a,
        segments[i].b,
        segments[j].a,
        segments[j].b,
      );
      if (!pt) continue;

      // Every segment passing through this point must be registered so each
      // one gets split here (multi-way crossings).
      const key = pointKey(pt[1], pt[0]);
      const group = intersections.get(key);
      if (group) {
        if (!group.segs.includes(i)) group.segs.push(i);
        if (!group.segs.includes(j)) group.segs.push(j);
      } else {
        intersections.set(key, { point: pt, segs: [i, j] });
      }
    }
  }

  return intersections;
}
