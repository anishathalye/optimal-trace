import { describe, it, expect } from 'vitest';
import { removeLogicalEdge } from '../graph/mutate';
import { pointKey } from '../graph/types';
import { pruneGraph } from '../graph/prune';
import type { Graph } from '../graph/types';
import { haversineDistance } from '../utils/geo';

function makeGraph(edges: Array<[[number, number], [number, number]]>): Graph {
  const nodes = new Map<string, { lat: number; lng: number }>();
  const graphEdges: Array<{
    from: string;
    to: string;
    weight: number;
    coords: [number, number][];
  }> = [];
  const adjacency = new Map<string, Map<string, number>>();

  for (const [[lng1, lat1], [lng2, lat2]] of edges) {
    const key1 = pointKey(lat1, lng1);
    const key2 = pointKey(lat2, lng2);
    nodes.set(key1, { lat: lat1, lng: lng1 });
    nodes.set(key2, { lat: lat2, lng: lng2 });

    const weight = haversineDistance(lat1, lng1, lat2, lng2);
    graphEdges.push({
      from: key1,
      to: key2,
      weight,
      coords: [
        [lng1, lat1],
        [lng2, lat2],
      ],
    });

    if (!adjacency.has(key1)) adjacency.set(key1, new Map());
    if (!adjacency.has(key2)) adjacency.set(key2, new Map());
    adjacency.get(key1)!.set(key2, weight);
    adjacency.get(key2)!.set(key1, weight);
  }

  return { nodes, edges: graphEdges, adjacency };
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

describe('removeLogicalEdge', () => {
  it('removes chain using logical graph coords', () => {
    const raw = makeGraph([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [2, 0],
      ],
    ]);
    const logical = pruneGraph(raw);
    const a = pointKey(0, 0);
    const c = pointKey(0, 2);

    const result = removeLogicalEdge(raw, logical, edgeKey(a, c));
    expect(result.edges.length).toBe(0);
  });

  it('removes direct edge using logical graph coords', () => {
    const raw = makeGraph([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [2, 0],
      ],
      [
        [2, 0],
        [0, 0],
      ],
    ]);
    const logical = pruneGraph(raw);
    const a = pointKey(0, 0);
    const c = pointKey(0, 2);

    const edgeKeys = logical.edges.map((e) => edgeKey(e.from, e.to));
    expect(edgeKeys).toContain(edgeKey(a, c));

    const result = removeLogicalEdge(raw, logical, edgeKey(a, c));
    expect(result.edges.length).toBe(2);
  });

  it('returns graph unchanged when no logical graph provided', () => {
    const raw = makeGraph([
      [
        [0, 0],
        [1, 0],
      ],
    ]);
    const a = pointKey(0, 0);
    const b = pointKey(0, 1);

    const result = removeLogicalEdge(raw, null, edgeKey(a, b));
    expect(result.edges.length).toBe(1);
  });
});
