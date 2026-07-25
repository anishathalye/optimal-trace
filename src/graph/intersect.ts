import { pointKey } from './types';

export type Point = [number, number];

function cross(a: Point, b: Point): number {
  return a[0] * b[1] - a[1] * b[0];
}

function subtract(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1]];
}

function orientation(p: Point, q: Point, r: Point): number {
  return cross(subtract(q, p), subtract(r, p));
}

function onSegment(p: Point, q: Point, r: Point): boolean {
  return (
    Math.min(p[0], r[0]) <= q[0] &&
    q[0] <= Math.max(p[0], r[0]) &&
    Math.min(p[1], r[1]) <= q[1] &&
    q[1] <= Math.max(p[1], r[1])
  );
}

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;

  return o1 * o2 < 0 && o3 * o4 < 0;
}

function intersectionPoint(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
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

function bbox(a: Point, b: Point): { minX: number; maxX: number; minY: number; maxY: number } {
  return {
    minX: Math.min(a[0], b[0]),
    maxX: Math.max(a[0], b[0]),
    minY: Math.min(a[1], b[1]),
    maxY: Math.max(a[1], b[1]),
  };
}

function bboxesOverlap(
  b1: ReturnType<typeof bbox>,
  b2: ReturnType<typeof bbox>
): boolean {
  return b1.minX <= b2.maxX && b1.maxX >= b2.minX &&
         b1.minY <= b2.maxY && b1.maxY >= b2.minY;
}

export function findAllIntersections(
  segments: RawSegment[]
): Map<string, { point: Point; segA: number; segB: number }> {
  const intersections = new Map<string, { point: Point; segA: number; segB: number }>();

  const boxes = segments.map((s) => bbox(s.a, s.b));

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (!bboxesOverlap(boxes[i], boxes[j])) continue;

      const pt = intersectionPoint(segments[i].a, segments[i].b, segments[j].a, segments[j].b);
      if (!pt) continue;

      const key = pointKey(pt[1], pt[0]);
      if (!intersections.has(key)) {
        intersections.set(key, { point: pt, segA: i, segB: j });
      }
    }
  }

  return intersections;
}
