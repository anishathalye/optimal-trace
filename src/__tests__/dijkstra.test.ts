import { describe, it, expect } from 'vitest';
import { dijkstra, reconstructPath } from '../solver/dijkstra';
import { pointKey } from '../graph/types';
import type { Graph } from '../graph/types';
import { haversineDistance } from '../utils/geo';

function makeGraph(
  edges: Array<[[number, number], [number, number]]>
): Graph {
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

describe('dijkstra', () => {
  it('finds shortest path on a simple line', () => {
    const g = makeGraph([
      [[0, 0], [0.001, 0]],
      [[0.001, 0], [0.002, 0]],
    ]);
    const src = pointKey(0, 0);
    const { distances } = dijkstra(g, src);
    const end = pointKey(0, 0.002);
    expect(distances.get(end)).toBeGreaterThan(0);
    expect(distances.get(end)).toBeLessThan(Infinity);
  });

  it('handles disconnected component', () => {
    const g = makeGraph([
      [[0, 0], [0.001, 0]],
      [[0.002, 0], [0.003, 0]],
    ]);
    const src = pointKey(0, 0);
    const { distances } = dijkstra(g, src);
    const unreachable = pointKey(0, 0.003);
    expect(distances.get(unreachable)).toBe(Infinity);
  });

  it('reconstructs path correctly', () => {
    const g = makeGraph([
      [[0, 0], [0.001, 0]],
      [[0.001, 0], [0.002, 0]],
    ]);
    const src = pointKey(0, 0);
    const target = pointKey(0, 0.002);
    const { previous } = dijkstra(g, src);
    const path = reconstructPath(previous, target);
    expect(path.length).toBe(3);
    expect(path[0]).toBe(src);
    expect(path[2]).toBe(target);
  });
});
