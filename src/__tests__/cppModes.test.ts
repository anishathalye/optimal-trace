import { describe, it, expect } from 'vitest';
import { solveCPP } from '../solver/cpp';
import { pointKey } from '../graph/types';
import type { Graph } from '../graph/types';
import type { ElevationLookup } from '../solver/costs';
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

const elevationOf: ElevationLookup = (_lat, lng) => lng * 10000;

describe('solveCPP routing modes', () => {
  const graph = makeGraph([
    [
      [0, 0],
      [0.001, 0],
    ],
    [
      [0.001, 0],
      [0.002, 0],
    ],
  ]);
  const start = firstNode(graph);

  it('minimizes distance by default and reports no elevation stats', () => {
    const result = solveCPP(graph, start);
    expect(result.elevationGain).toBeUndefined();
    expect(result.estimatedTime).toBeUndefined();
    expect(result.totalDistance).toBeGreaterThanOrEqual(result.uniqueDistance);
  });

  it('reports elevation gain/loss for elevation mode', () => {
    const result = solveCPP(graph, start, { mode: 'elevation', elevationOf });
    expect(result.elevationGain).toBeGreaterThan(0);
    expect(result.elevationLoss).toBeCloseTo(result.elevationGain!, 5);
  });

  it('keeps totalDistance in meters for elevation mode', () => {
    const distanceResult = solveCPP(graph, start, { mode: 'distance' });
    const elevationResult = solveCPP(graph, start, {
      mode: 'elevation',
      elevationOf,
    });
    expect(elevationResult.totalDistance).toBeCloseTo(
      distanceResult.totalDistance,
      5,
    );
  });
});
