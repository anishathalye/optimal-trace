import { describe, it, expect } from 'vitest';
import buildGraph from '../graph/build';
import {
  connectedComponents,
  oddDegreeNodes,
  totalEdgeDistance,
} from '../graph/utils';
import type { Graph } from '../graph/types';
import type { GeoJSONFeature } from '../hooks/useOverpass';

function makeFeature(coords: [number, number][]): GeoJSONFeature {
  return {
    type: 'Feature' as const,
    id: `test-${Math.random()}`,
    geometry: { type: 'LineString' as const, coordinates: coords },
    properties: {},
  };
}

describe('buildGraph', () => {
  it('builds a simple two-segment trail', () => {
    const features = [
      makeFeature([
        [0, 0],
        [0.001, 0],
        [0.002, 0],
      ]),
    ];
    const graph = buildGraph(features);
    expect(graph.nodes.size).toBe(3);
    expect(graph.edges.length).toBe(2);
  });

  it('splits at a crossing intersection', () => {
    const features = [
      makeFeature([
        [0, 0],
        [0.002, 0.002],
      ]),
      makeFeature([
        [0, 0.002],
        [0.002, 0],
      ]),
    ];
    const graph = buildGraph(features);
    expect(graph.nodes.size).toBeGreaterThanOrEqual(4);
    expect(graph.edges.length).toBeGreaterThanOrEqual(4);
  });

  it('connects at shared endpoints', () => {
    const features = [
      makeFeature([
        [0, 0],
        [0.001, 0],
      ]),
      makeFeature([
        [0.001, 0],
        [0.001, 0.001],
      ]),
    ];
    const graph = buildGraph(features);
    const components = connectedComponents(graph);
    expect(components.length).toBe(1);
  });

  it('connects near-miss endpoints via point rounding', () => {
    const features = [
      makeFeature([
        [0, 0],
        [0.001, 0],
      ]),
      makeFeature([
        [0.00100008, 0.00000009],
        [0.001, 0.001],
      ]),
    ];
    const graph = buildGraph(features);
    const components = connectedComponents(graph);
    expect(components.length).toBe(1);
  });

  it('splits multi-segment trail at crossing intersection', () => {
    const features = [
      makeFeature([
        [0, 0],
        [0.004, 0.002],
        [0.006, 0],
      ]),
      makeFeature([
        [0.003, -0.002],
        [0.003, 0.002],
      ]),
    ];
    const graph = buildGraph(features);
    const components = connectedComponents(graph);
    expect(components.length).toBe(1);
    expect(graph.nodes.size).toBeGreaterThanOrEqual(5);
    expect(graph.edges.length).toBeGreaterThanOrEqual(4);
  });

  it('builds connected graph for crossing trails', () => {
    const features = [
      makeFeature([
        [0, 0],
        [0.002, 0],
      ]),
      makeFeature([
        [0.001, -0.001],
        [0.001, 0.001],
      ]),
    ];
    const graph = buildGraph(features);
    const components = connectedComponents(graph);
    expect(components.length).toBe(1);
  });

  it('connects all ways of a three-way interior crossing', () => {
    // Three trails crossing at the exact same interior point (1, 0).
    const features = [
      makeFeature([
        [0, 0],
        [2, 0],
      ]),
      makeFeature([
        [1, -1],
        [1, 1],
      ]),
      makeFeature([
        [0.9, -1],
        [1.1, 1],
      ]),
    ];
    const graph = buildGraph(features);
    const components = connectedComponents(graph);
    expect(components.length).toBe(1);
  });
});

describe('graph/utils', () => {
  it('counts odd-degree nodes', () => {
    const features = [
      makeFeature([
        [0, 0],
        [0.001, 0],
      ]),
      makeFeature([
        [0.001, 0],
        [0.001, 0.001],
      ]),
    ];
    const graph = buildGraph(features);
    const odd = oddDegreeNodes(graph);
    expect(odd.length % 2).toBe(0);
  });

  it('regression: counts parallel edges in degree parity', () => {
    // Square with one side doubled. True degrees: A=3, B=3, C=2, D=2.
    const A = 'A';
    const B = 'B';
    const C = 'C';
    const D = 'D';
    const mkEdge = (from: string, to: string) => ({
      from,
      to,
      weight: 1,
      coords: [] as [number, number][],
    });
    const graph: Graph = {
      nodes: new Map([
        [A, { lat: 0, lng: 0 }],
        [B, { lat: 0, lng: 1 }],
        [C, { lat: 1, lng: 1 }],
        [D, { lat: 1, lng: 0 }],
      ]),
      edges: [
        mkEdge(A, B),
        mkEdge(A, B), // parallel
        mkEdge(B, C),
        mkEdge(C, D),
        mkEdge(D, A),
      ],
      adjacency: new Map([
        [
          A,
          new Map([
            [B, 1],
            [D, 1],
          ]),
        ],
        [
          B,
          new Map([
            [A, 1],
            [C, 1],
          ]),
        ],
        [
          C,
          new Map([
            [B, 1],
            [D, 1],
          ]),
        ],
        [
          D,
          new Map([
            [C, 1],
            [A, 1],
          ]),
        ],
      ]),
    };

    const odd = oddDegreeNodes(graph).sort();
    expect(odd).toEqual([A, B]);
  });

  it('totalEdgeDistance is positive for non-empty graph', () => {
    const features = [
      makeFeature([
        [0, 0],
        [0.001, 0],
      ]),
    ];
    const graph = buildGraph(features);
    expect(totalEdgeDistance(graph)).toBeGreaterThan(0);
  });

  it('ignores non-LineString features', () => {
    const features: GeoJSONFeature[] = [
      {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [0, 0] as [number, number],
        },
        properties: {},
      },
    ];
    const graph = buildGraph(features);
    expect(graph.nodes.size).toBe(0);
  });
});
