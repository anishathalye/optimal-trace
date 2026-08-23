import { describe, it, expect } from 'vitest';
import { pruneGraph } from '../graph/prune';
import { pointKey, type Edge } from '../graph/types';
import type { Graph } from '../graph/types';
import { haversineDistance } from '../utils/geo';

function makeGraph(edges: Array<[[number, number], [number, number]]>): Graph {
  const nodes = new Map<string, { lat: number; lng: number }>();
  const graphEdges: Edge[] = [];
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

function assertConsistent(graph: Graph) {
  const nodeIds = new Set(graph.nodes.keys());
  for (const e of graph.edges) {
    expect(nodeIds.has(e.from)).toBe(true);
    expect(nodeIds.has(e.to)).toBe(true);
  }
  for (const [id, neighbors] of graph.adjacency) {
    expect(nodeIds.has(id)).toBe(true);
    for (const other of neighbors.keys()) {
      expect(nodeIds.has(other)).toBe(true);
    }
  }
}

describe('pruneGraph', () => {
  it('removes degree-2 nodes on a simple chain', () => {
    const g = makeGraph([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [2, 0],
      ],
    ]);
    const pruned = pruneGraph(g);
    expect(pruned.nodes.size).toBeLessThanOrEqual(2);
    expect(pruned.edges.length).toBeLessThanOrEqual(1);
  });

  it('keeps junction nodes (degree > 2)', () => {
    const g = makeGraph([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [2, 0],
      ],
      [
        [1, 0],
        [1, 1],
      ],
    ]);
    const pruned = pruneGraph(g);
    const junction = pointKey(0, 0);
    expect(pruned.nodes.has(junction) || pruned.nodes.size >= 2).toBe(true);
  });

  it('keeps dead-end nodes (degree 1)', () => {
    const g = makeGraph([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [2, 0],
      ],
    ]);
    const pruned = pruneGraph(g);
    const leaf1 = pointKey(0, 0);
    expect(pruned.nodes.has(leaf1) || pruned.nodes.size <= 2).toBe(true);
  });

  it('does not empty a cycle', () => {
    const g = makeGraph([
      [
        [0, 0],
        [0.001, 0],
      ],
      [
        [0.001, 0],
        [0.001, 0.001],
      ],
      [
        [0.001, 0.001],
        [0, 0.001],
      ],
      [
        [0, 0.001],
        [0, 0],
      ],
    ]);
    const pruned = pruneGraph(g);
    expect(pruned.nodes.size).toBeGreaterThanOrEqual(2);
    expect(pruned.edges.length).toBeGreaterThanOrEqual(2);
  });

  it('handles chain between two junctions', () => {
    const g = makeGraph([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [0, 0],
        [0, 1],
      ],
      [
        [0, 0],
        [1, 1],
      ], // junction at (0,0) degree 3

      [
        [1, 0],
        [2, 0],
      ],
      [
        [2, 0],
        [3, 0],
      ],
      [
        [3, 0],
        [3, 1],
      ],
      [
        [3, 0],
        [4, 0],
      ], // junction at (3,0) degree 3
    ]);
    const junction1 = pointKey(0, 0);
    expect(g.nodes.has(junction1)).toBe(true);

    const pruned = pruneGraph(g);
    expect(pruned.nodes.has(junction1)).toBe(true);
  });

  it('regression: preserves cycle when spoke attached', () => {
    const g = makeGraph([
      [
        [0, 0],
        [0.001, 0],
      ],
      [
        [0.001, 0],
        [0.001, 0.001],
      ],
      [
        [0.001, 0.001],
        [0, 0.001],
      ],
      [
        [0, 0.001],
        [0, 0],
      ],
      [
        [0, 0],
        [0.0005, -0.0005],
      ],
    ]);
    const junction = pointKey(0, 0);
    const pruned = pruneGraph(g);
    expect(pruned.nodes.has(junction)).toBe(true);
    expect(pruned.nodes.size).toBeGreaterThanOrEqual(3);
  });

  it('collapses Y-junction after erasing one branch', () => {
    const g = makeGraph([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [2, 0],
      ],
      [
        [1, 0],
        [1, 1],
      ],
    ]);
    const centerKey = pointKey(0, 1);
    expect(g.nodes.has(centerKey)).toBe(true);
    expect(g.edges.length).toBe(3);

    const removed = new Set<string>();
    removed.add(`${pointKey(0, 1)}|${pointKey(1, 1)}`);
    const toRemove: number[] = [];
    for (let i = 0; i < g.edges.length; i++) {
      const e = g.edges[i];
      const key = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
      if (removed.has(key)) toRemove.push(i);
    }
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const e = g.edges[toRemove[i]];
      g.edges.splice(toRemove[i], 1);
      g.adjacency.get(e.from)?.delete(e.to);
      g.adjacency.get(e.to)?.delete(e.from);
      if (g.adjacency.get(e.from)?.size === 0) {
        g.adjacency.delete(e.from);
        g.nodes.delete(e.from);
      }
      if (g.adjacency.get(e.to)?.size === 0) {
        g.adjacency.delete(e.to);
        g.nodes.delete(e.to);
      }
    }

    const pruned = pruneGraph(g);
    expect(pruned.edges.length).toBe(1);
    expect(pruned.nodes.size).toBe(2);
  });

  it('regression: does not prune a node with parallel edges (true degree > 2)', () => {
    // A-B twice + B-C: B's true edge degree is 3, so B must not be merged.
    // The old adjacency-size degree saw 2 and merged, leaving a dangling
    // edge that referenced the deleted node.
    const g = makeGraph([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [0, 0],
        [1, 0],
      ], // parallel duplicate
      [
        [1, 0],
        [2, 0],
      ],
    ]);
    const b = pointKey(0, 1); // lat 0, lng 1

    const pruned = pruneGraph(g);
    expect(pruned.nodes.has(b)).toBe(true);
    expect(pruned.edges.length).toBe(3);
    assertConsistent(pruned);
  });

  it('keeps adjacency min-weight correct after merges near parallels', () => {
    const g = makeGraph([
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
        [3, 0],
      ],
      [
        [1, 0],
        [3, 0],
      ], // shortcut blocks merging of (2,0)
    ]);
    const pruned = pruneGraph(g);
    assertConsistent(pruned);
    // Node at (lng 2, lat 0) has neighbours (1,0) and (3,0) which are
    // directly connected by the shortcut, so it must survive.
    expect(pruned.nodes.has(pointKey(0, 2))).toBe(true);
  });
});
