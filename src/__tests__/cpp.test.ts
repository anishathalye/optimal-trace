import { describe, it, expect } from 'vitest';
import { solveCPP } from '../solver/cpp';
import { pointKey } from '../graph/types';
import type { Graph } from '../graph/types';
import { oddDegreeNodes } from '../graph/utils';
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

function firstNode(graph: Graph): string {
  return graph.nodes.keys().next().value!;
}

describe('solveCPP', () => {
  it('solves already-Eulerian graph (line)', () => {
    const g = makeGraph([
      [
        [0, 0],
        [0.001, 0],
      ],
    ]);
    const start = firstNode(g);
    const result = solveCPP(g, start);
    expect(result.coords.length).toBeGreaterThanOrEqual(2);
    expect(result.totalDistance).toBeGreaterThan(0);
  });

  it('solves single triangle (all even degree)', () => {
    const g = makeGraph([
      [
        [0, 0],
        [0.001, 0],
      ],
      [
        [0.001, 0],
        [0.0005, 0.001],
      ],
      [
        [0.0005, 0.001],
        [0, 0],
      ],
    ]);
    const start = firstNode(g);
    const result = solveCPP(g, start);
    expect(result.coords.length).toBeGreaterThanOrEqual(3);
  });

  it('solves graph with two odd-degree nodes', () => {
    const g = makeGraph([
      [
        [0, 0],
        [0.001, 0],
      ],
      [
        [0.001, 0],
        [0.002, 0],
      ],
    ]);
    const start = firstNode(g);
    const result = solveCPP(g, start);
    expect(result.coords.length).toBeGreaterThanOrEqual(3);
    expect(result.totalDistance).toBeGreaterThanOrEqual(result.uniqueDistance);
  });

  it('solves graph with four odd-degree nodes (two chains)', () => {
    const g = makeGraph([
      [
        [0, 0],
        [0.001, 0],
      ],
      [
        [0.001, 0],
        [0.002, 0],
      ],
      [
        [0, 0.001],
        [0.001, 0.001],
      ],
      [
        [0.001, 0.001],
        [0.002, 0.001],
      ],
    ]);
    const start = firstNode(g);
    const odd = oddDegreeNodes(g);
    expect(odd.length).toBe(4);

    const result = solveCPP(g, start);
    expect(result.totalDistance).toBeGreaterThanOrEqual(result.uniqueDistance);
    expect(result.coords.length).toBeGreaterThan(0);
  });

  it('regression: blossom matching on four odd-degree nodes does not throw', () => {
    const g = makeGraph([
      [
        [0, 0],
        [0.001, 0],
      ],
      [
        [0.001, 0],
        [0.002, 0],
      ],
      [
        [0, 0.001],
        [0.001, 0.001],
      ],
      [
        [0.001, 0.001],
        [0.002, 0.001],
      ],
    ]);
    const start = firstNode(g);
    expect(() => solveCPP(g, start)).not.toThrow();
  });

  it('regression: expandBlossom path with six odd-degree nodes', () => {
    const g = makeGraph([
      [
        [0, 0],
        [0.001, 0],
      ],
      [
        [0.001, 0],
        [0.002, 0],
      ],
      [
        [0, 0.001],
        [0.001, 0.001],
      ],
      [
        [0.001, 0.001],
        [0.002, 0.001],
      ],
      [
        [0, 0.002],
        [0.001, 0.002],
      ],
      [
        [0.001, 0.002],
        [0.002, 0.002],
      ],
    ]);
    const start = firstNode(g);
    expect(() => solveCPP(g, start)).not.toThrow();
  });

  it('regression: retraced segments are marked in out-and-back', () => {
    const g = makeGraph([
      [
        [0, 0],
        [0.001, 0],
      ],
      [
        [0.001, 0],
        [0.002, 0],
      ],
    ]);
    const start = firstNode(g);
    const result = solveCPP(g, start);
    const green = result.segments.filter((s) => !s.retraced);
    const orange = result.segments.filter((s) => s.retraced);
    expect(green.length).toBeGreaterThan(0);
    expect(orange.length).toBeGreaterThan(0);
    expect(result.segments.every((s) => s.coords.length >= 2)).toBe(true);
  });
});
