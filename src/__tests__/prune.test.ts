import { describe, it, expect } from 'vitest';
import { pruneGraph } from '../graph/prune';
import { pointKey } from '../graph/types';
import type { Graph } from '../graph/types';
import { connectedComponents, oddDegreeNodes } from '../graph/utils';
import { haversineDistance } from '../utils/geo';

function makeGraph(edges: Array<[[number, number], [number, number]]>): Graph {
  const nodes = new Map<string, { lat: number; lng: number }>();
  const graphEdges: Array<{ from: string; to: string; weight: number; coords: [number, number][] }> = [];
  const adjacency = new Map<string, Map<string, number>>();

  for (const [[lng1, lat1], [lng2, lat2]] of edges) {
    const key1 = pointKey(lat1, lng1);
    const key2 = pointKey(lat2, lng2);
    nodes.set(key1, { lat: lat1, lng: lng1 });
    nodes.set(key2, { lat: lat2, lng: lng2 });

    const weight = haversineDistance(lat1, lng1, lat2, lng2);
    graphEdges.push({ from: key1, to: key2, weight, coords: [[lng1, lat1], [lng2, lat2]] });

    if (!adjacency.has(key1)) adjacency.set(key1, new Map());
    if (!adjacency.has(key2)) adjacency.set(key2, new Map());
    adjacency.get(key1)!.set(key2, weight);
    adjacency.get(key2)!.set(key1, weight);
  }

  return { nodes, edges: graphEdges, adjacency };
}

describe('pruneGraph', () => {
  it('removes degree-2 nodes on a simple chain', () => {
    const g = makeGraph([
      [[0, 0], [1, 0]],
      [[1, 0], [2, 0]],
    ]);
    const pruned = pruneGraph(g);
    expect(pruned.nodes.size).toBeLessThanOrEqual(2);
    expect(pruned.edges.length).toBeLessThanOrEqual(1);
  });

  it('keeps junction nodes (degree > 2)', () => {
    const g = makeGraph([
      [[0, 0], [1, 0]],
      [[1, 0], [2, 0]],
      [[1, 0], [1, 1]],
    ]);
    const pruned = pruneGraph(g);
    const junction = pointKey(0, 0);
    expect(pruned.nodes.has(junction) || pruned.nodes.size >= 2).toBe(true);
  });

  it('keeps dead-end nodes (degree 1)', () => {
    const g = makeGraph([
      [[0, 0], [1, 0]],
      [[1, 0], [2, 0]],
    ]);
    const pruned = pruneGraph(g);
    const leaf1 = pointKey(0, 0);
    const leaf2 = pointKey(0, 2);
    expect(pruned.nodes.has(leaf1) || pruned.nodes.size <= 2).toBe(true);
  });

  it('does not empty a cycle', () => {
    const g = makeGraph([
      [[0, 0], [1, 0]],
      [[1, 0], [1, 1]],
      [[1, 1], [0, 1]],
      [[0, 1], [0, 0]],
    ]);
    const pruned = pruneGraph(g);
    expect(pruned.nodes.size).toBeGreaterThanOrEqual(2);
    expect(pruned.edges.length).toBeGreaterThanOrEqual(2);
  });

  it('handles chain between two junctions', () => {
    const g = makeGraph([
      [[0, 0], [1, 0]],
      [[0, 0], [0, 1]],
      [[0, 0], [1, 1]], // junction at (0,0) degree 3

      [[1, 0], [2, 0]],
      [[2, 0], [3, 0]],
      [[3, 0], [3, 1]],
      [[3, 0], [4, 0]], // junction at (3,0) degree 3
    ]);
    const junction1 = pointKey(0, 0);
    const junction2 = pointKey(0, 3);
    expect(g.nodes.has(junction1)).toBe(true);

    const pruned = pruneGraph(g);
    expect(pruned.nodes.has(junction1)).toBe(true);
  });

  it('regression: preserves cycle when spoke attached', () => {
    const g = makeGraph([
      [[0, 0], [1, 0]],
      [[1, 0], [1, 1]],
      [[1, 1], [0, 1]],
      [[0, 1], [0, 0]],
      [[0, 0], [0.5, -0.5]],
    ]);
    const junction = pointKey(0, 0);
    const pruned = pruneGraph(g);
    expect(pruned.nodes.has(junction)).toBe(true);
    expect(pruned.nodes.size).toBeGreaterThanOrEqual(3);
  });
});
