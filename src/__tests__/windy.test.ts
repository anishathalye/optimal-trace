import { beforeAll, describe, it, expect } from 'vitest';
import GLPK from 'glpk.js/node';
import type { GLPK as NodeGLPKInstance, LP } from 'glpk.js/node';
import {
  solveWindyCPP,
  buildWindyLP,
  traversalsFromSolution,
  type WindyLP,
} from '../solver/windy';
import { directedEdgeCosts, type ElevationLookup } from '../solver/costs';
import { pointKey } from '../graph/types';
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

function firstNode(graph: Graph): string {
  return graph.nodes.keys().next().value!;
}

const elevationOf: ElevationLookup = (_lat, lng) => lng * 10000;

let glpk: NodeGLPKInstance;

beforeAll(async () => {
  glpk = await GLPK();
});

const solveLP = (lp: WindyLP) =>
  Promise.resolve(
    glpk.solve(lp as unknown as LP, { msglev: 0, presol: true }).result.vars,
  );

describe('buildWindyLP', () => {
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

  it('creates two directed variables per edge', () => {
    const { lp } = buildWindyLP(graph, elevationOf);
    expect(lp.objective.vars).toHaveLength(graph.edges.length * 2);
    expect(lp.generals).toHaveLength(graph.edges.length * 2);
    expect(lp.bounds).toHaveLength(graph.edges.length * 2);
  });

  it('creates one cover constraint per edge plus one balance per node', () => {
    const { lp } = buildWindyLP(graph, elevationOf);
    expect(lp.subjectTo).toHaveLength(graph.edges.length + graph.nodes.size);
  });

  it('round-trips a solution into traversal counts', () => {
    const { edgeDir } = buildWindyLP(graph, elevationOf);
    const solution: Record<string, number> = {};
    for (const [name] of edgeDir) solution[name] = 1;
    const traversals = traversalsFromSolution(edgeDir, solution);
    for (const edge of graph.edges) {
      expect(traversals.get(edge.from)?.get(edge.to)).toBe(1);
      expect(traversals.get(edge.to)?.get(edge.from)).toBe(1);
    }
  });
});

describe('solveWindyCPP', () => {
  it('solves an out-and-back path with equal ascent and descent', async () => {
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
    const result = await solveWindyCPP(graph, start, elevationOf, solveLP);

    expect(result.coords.length).toBeGreaterThan(0);
    expect(result.totalDistance).toBeCloseTo(result.uniqueDistance * 2, 5);
    expect(result.elevationGain).toBeGreaterThan(0);
    expect(result.elevationLoss).toBeCloseTo(result.elevationGain!, 5);
    expect(result.estimatedTime).toBeGreaterThan(0);
  });

  it('covers an Eulerian triangle exactly once', async () => {
    const graph = makeGraph([
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
    const start = firstNode(graph);
    const result = await solveWindyCPP(graph, start, elevationOf, solveLP);

    expect(result.totalDistance).toBeCloseTo(result.uniqueDistance, 5);
    expect(result.coords.length).toBeGreaterThanOrEqual(3);
  });

  it('prefers the cheaper of the two triangle orientations', async () => {
    const graph = makeGraph([
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
    const start = firstNode(graph);

    let clockwise = 0;
    let counterclockwise = 0;
    for (const edge of graph.edges) {
      const { forward, reverse } = directedEdgeCosts(edge, elevationOf);
      clockwise += forward;
      counterclockwise += reverse;
    }

    const result = await solveWindyCPP(graph, start, elevationOf, solveLP);

    expect(result.estimatedTime).toBeCloseTo(
      Math.min(clockwise, counterclockwise),
      3,
    );
    expect(result.estimatedTime).toBeLessThan(
      Math.max(clockwise, counterclockwise),
    );
  });
});
