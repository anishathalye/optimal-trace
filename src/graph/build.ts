import type { GeoJSONFeature } from '../hooks/useOverpass';
import { pointKey, type Node, type Edge, type Graph } from './types';
import {
  findAllIntersections,
  type RawSegment,
  type Point,
} from './intersect';
import { haversineDistance } from '../utils/geo';

function flattenSegments(features: GeoJSONFeature[]): {
  segments: RawSegment[];
  coords: [number, number][][];
} {
  const segments: RawSegment[] = [];
  const coords: [number, number][][] = [];

  for (let fi = 0; fi < features.length; fi++) {
    const geom = features[fi].geometry;
    if (geom.type !== 'LineString') continue;
    const pts = geom.coordinates as [number, number][];
    coords.push(pts);

    for (let i = 0; i < pts.length - 1; i++) {
      segments.push({
        a: pts[i],
        b: pts[i + 1],
        featureIdx: fi,
        segmentIdx: i,
      });
    }
  }

  return { segments, coords };
}

function buildGraph(features: GeoJSONFeature[]): Graph {
  const { segments, coords } = flattenSegments(features);

  const intersectionMap = findAllIntersections(segments);

  const segIntersections = new Map<number, { point: Point; dist: number }[]>();
  const segKey = (fi: number, si: number) => fi * 1_000_000 + si;

  for (const [, inter] of intersectionMap) {
    const keyA = segKey(segments[inter.segA].featureIdx, segments[inter.segA].segmentIdx);
    const keyB = segKey(segments[inter.segB].featureIdx, segments[inter.segB].segmentIdx);

    const distA = haversineDistance(segments[inter.segA].a[1], segments[inter.segA].a[0], inter.point[1], inter.point[0]);
    const distB = haversineDistance(segments[inter.segB].a[1], segments[inter.segB].a[0], inter.point[1], inter.point[0]);

    if (!segIntersections.has(keyA)) segIntersections.set(keyA, []);
    segIntersections.get(keyA)!.push({ point: inter.point, dist: distA });

    if (!segIntersections.has(keyB)) segIntersections.set(keyB, []);
    segIntersections.get(keyB)!.push({ point: inter.point, dist: distB });
  }

  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];
  const adjacency = new Map<string, Map<string, number>>();

  function addNode(key: string, lat: number, lng: number) {
    if (!nodes.has(key)) {
      nodes.set(key, { lat, lng });
    }
  }

  function addEdge(fromKey: string, toKey: string, edgeCoords: [number, number][]) {
    if (fromKey === toKey) return;
    let dist = 0;
    for (let i = 1; i < edgeCoords.length; i++) {
      dist += haversineDistance(edgeCoords[i - 1][1], edgeCoords[i - 1][0], edgeCoords[i][1], edgeCoords[i][0]);
    }
    if (dist < 0.1) return;

    edges.push({ from: fromKey, to: toKey, weight: dist, coords: edgeCoords });

    if (!adjacency.has(fromKey)) adjacency.set(fromKey, new Map());
    if (!adjacency.has(toKey)) adjacency.set(toKey, new Map());

    const existing = adjacency.get(fromKey)!.get(toKey);
    if (existing === undefined || dist < existing) {
      adjacency.get(fromKey)!.set(toKey, dist);
      adjacency.get(toKey)!.set(fromKey, dist);
    }
  }

  for (let fi = 0; fi < features.length; fi++) {
    const geom = features[fi].geometry;
    if (geom.type !== 'LineString') continue;
    const pts = coords[fi];

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const key = segKey(fi, i);

      const inters = segIntersections.get(key) || [];
      inters.sort((x, y) => x.dist - y.dist);

      if (inters.length === 0) {
        const keyA = pointKey(a[1], a[0]);
        const keyB = pointKey(b[1], b[0]);
        addNode(keyA, a[1], a[0]);
        addNode(keyB, b[1], b[0]);
        addEdge(keyA, keyB, [a, b]);
      } else {
        const subCoords: [number, number][] = [a];
        for (const inter of inters) {
          subCoords.push(inter.point);
        }
        subCoords.push(b);

        for (let j = 0; j < subCoords.length - 1; j++) {
          const c1 = subCoords[j];
          const c2 = subCoords[j + 1];
          const key1 = pointKey(c1[1], c1[0]);
          const key2 = pointKey(c2[1], c2[0]);
          addNode(key1, c1[1], c1[0]);
          addNode(key2, c2[1], c2[0]);
          addEdge(key1, key2, [c1, c2]);
        }
      }
    }
  }

  return { nodes, edges, adjacency };
}

export default buildGraph;
