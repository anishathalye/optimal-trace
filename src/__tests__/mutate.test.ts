import { describe, it, expect } from 'vitest';
import {
  removeLogicalEdge,
  removeRawEdge,
  removeEdgeById,
  buildGraphWithRemovals,
  addManualEdge,
  addManualEdges,
} from '../graph/mutate';
import buildGraph from '../graph/build';
import { pointKey, PHYSICAL_EDGE_PREFIX } from '../graph/types';
import { pruneGraph } from '../graph/prune';
import type { Graph } from '../graph/types';
import { connectedComponents } from '../graph/utils';
import type { GeoJSONFeature } from '../hooks/useOverpass';
import { haversineDistance } from '../utils/geo';

function makeFeature(coords: [number, number][]): GeoJSONFeature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: {},
  };
}

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

describe('buildGraphWithRemovals', () => {
  it('rebuilds a graph from features and applies removals', () => {
    const features = [
      makeFeature([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
    ];
    const base = buildGraph(features);
    const logical = pruneGraph(base);
    const id = edgeKey(pointKey(0, 0), pointKey(0, 2));

    expect(logical.edges.map((e) => edgeKey(e.from, e.to))).toContain(id);

    const result = buildGraphWithRemovals(features, [id]);
    expect(result.edges.length).toBe(0);
  });

  it('removal ids from the unpreserved logical graph survive a rebuild', () => {
    // A degree-2 middle node merges into a single logical edge. The id used
    // for removal must come from pruneGraph without a preserved start node,
    // because save/load rebuilds the graph without a start point.
    const features = [
      makeFeature([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
      makeFeature([
        [5, 0],
        [5.0001, 0],
        [5.0002, 0],
      ]),
    ];
    const base = buildGraph(features);
    const logical = pruneGraph(base);
    const id = edgeKey(pointKey(0, 0), pointKey(0, 2));

    expect(logical.edges.map((e) => edgeKey(e.from, e.to))).toContain(id);

    const result = buildGraphWithRemovals(features, [id]);
    expect(result.edges.some((e) => edgeKey(e.from, e.to) === id)).toBe(false);
    // the other (tiny) component is untouched
    expect(result.edges.some((e) => e.coords.some(([lng]) => lng > 4))).toBe(
      true,
    );
  });

  it('a stale preserved id from an old save is a harmless no-op', () => {
    // chain A(0,0)-B(1,0)-C(2,0); old buggy saves used the preserved id "A|B"
    // (start point at degree-2 B), which no longer matches on rebuild. It must
    // not resurrect the segment once the corrected id "A|C" is also stored.
    const features = [
      makeFeature([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
    ];
    const staleId = edgeKey(pointKey(0, 0), pointKey(0, 1)); // A|B
    const correctedId = edgeKey(pointKey(0, 0), pointKey(0, 2)); // A|C

    const staleOnly = buildGraphWithRemovals(features, [staleId]);
    expect(staleOnly.edges.length).toBe(2);

    const fixed = buildGraphWithRemovals(features, [staleId, correctedId]);
    expect(fixed.edges.length).toBe(0);
  });

  it('duplicate ids must not be deduplicated across batches', () => {
    // A square cycle collapses to a triangle. Removing the direct edge between
    // two corners leaves the other path (through the fourth corner) with the
    // same logical id. If removals are deduplicated, the second removal is
    // dropped and a segment comes back.
    const features = [
      makeFeature([
        [0, 0],
        [0, 2],
        [2, 2],
        [2, 0],
        [0, 0],
      ]),
    ];
    const b = pointKey(2, 0); // lng 0, lat 2
    const c = pointKey(2, 2); // lng 2, lat 2
    const d = pointKey(0, 2); // lng 2, lat 0
    const idCD = edgeKey(c, d);

    const connected = (
      g: ReturnType<typeof buildGraph>,
      x: string,
      y: string,
    ) =>
      connectedComponents(g).some(
        (comp) => comp.includes(x) && comp.includes(y),
      );

    // deduplicating (a Set) leaves the alternate path a-c-d connected to b-c
    const deduped = buildGraphWithRemovals(features, new Set([idCD]));
    expect(connected(deduped, b, c)).toBe(true);

    // preserving both occurrences removes the whole square
    const preserved = buildGraphWithRemovals(features, [idCD, idCD]);
    expect(connected(preserved, b, c)).toBe(false);
    expect(preserved.edges.length).toBe(0);
  });
});

describe('removeRawEdge', () => {
  it('removes a single physical edge by node pair', () => {
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
    const id = edgeKey(pointKey(0, 0), pointKey(0, 1));

    const result = removeRawEdge(raw, id);
    expect(result.edges.length).toBe(1);
  });

  it('returns the graph unchanged when the edge is not found', () => {
    const raw = makeGraph([
      [
        [0, 0],
        [1, 0],
      ],
    ]);
    const result = removeRawEdge(raw, edgeKey(pointKey(0, 0), pointKey(0, 5)));
    expect(result.edges.length).toBe(1);
  });
});

describe('removeEdgeById', () => {
  it('removes a physical edge for prefixed ids', () => {
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
    const id = PHYSICAL_EDGE_PREFIX + edgeKey(pointKey(0, 0), pointKey(0, 1));

    const result = removeEdgeById(raw, null, id);
    expect(result.edges.length).toBe(1);
  });

  it('removes a logical edge for unprefixed ids', () => {
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
    const id = edgeKey(pointKey(0, 0), pointKey(0, 2));

    const result = removeEdgeById(raw, logical, id);
    expect(result.edges.length).toBe(0);
  });
});

describe('addManualEdge', () => {
  it('adds a straight edge between two existing nodes', () => {
    const raw = makeGraph([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [2, 0],
        [3, 0],
      ],
    ]);
    const a = pointKey(0, 1);
    const b = pointKey(0, 2);

    expect(raw.edges.length).toBe(2);

    const result = addManualEdge(raw, {
      id: 'c',
      fromKey: a,
      toKey: b,
      from: { lat: 0, lng: 1 },
      to: { lat: 0, lng: 2 },
    });
    expect(result.edges.length).toBe(3);
    expect(result.adjacency.get(a)?.has(b)).toBe(true);
    expect(result.adjacency.get(b)?.has(a)).toBe(true);
  });

  it('does not add a duplicate edge', () => {
    const raw = makeGraph([
      [
        [0, 0],
        [1, 0],
      ],
    ]);
    const a = pointKey(0, 0);
    const b = pointKey(0, 1);

    const result = addManualEdge(raw, {
      id: 'c',
      fromKey: a,
      toKey: b,
      from: { lat: 0, lng: 0 },
      to: { lat: 0, lng: 1 },
    });
    expect(result.edges.length).toBe(1);
  });

  it('recreates a missing node from stored coords', () => {
    const raw = makeGraph([
      [
        [0, 0],
        [1, 0],
      ],
    ]);
    const fromKey = pointKey(0, 1);
    const toKey = pointKey(0, 2.5);

    const result = addManualEdge(raw, {
      id: 'c',
      fromKey,
      toKey,
      from: { lat: 0, lng: 1 },
      to: { lat: 0, lng: 2.5 },
    });
    expect(result.edges.length).toBe(2);
    expect(result.nodes.has(toKey)).toBe(true);
    expect(result.adjacency.get(fromKey)?.has(toKey)).toBe(true);
  });
});

describe('addManualEdges', () => {
  it('applies a list of connectors in order', () => {
    const raw = makeGraph([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [2, 0],
        [3, 0],
      ],
      [
        [4, 0],
        [5, 0],
      ],
    ]);
    const connectors = [
      {
        id: '1',
        fromKey: pointKey(0, 1),
        toKey: pointKey(0, 2),
        from: { lat: 0, lng: 1 },
        to: { lat: 0, lng: 2 },
      },
      {
        id: '2',
        fromKey: pointKey(0, 3),
        toKey: pointKey(0, 4),
        from: { lat: 0, lng: 3 },
        to: { lat: 0, lng: 4 },
      },
    ];

    const result = addManualEdges(raw, connectors);
    expect(result.edges.length).toBe(5);
    expect(result.adjacency.get(pointKey(0, 1))?.has(pointKey(0, 2))).toBe(
      true,
    );
    expect(result.adjacency.get(pointKey(0, 3))?.has(pointKey(0, 4))).toBe(
      true,
    );
  });

  it('bridges two components through a deleted intermediate node', () => {
    const raw = makeGraph([
      [
        [0, 0],
        [1, 0],
      ],
      [
        [4, 0],
        [5, 0],
      ],
    ]);
    const pKey = pointKey(0, 2.5);
    raw.nodes.set(pKey, { lat: 0, lng: 2.5 });

    const connectors = [
      {
        id: 'c1',
        fromKey: pointKey(0, 1),
        toKey: pKey,
        from: { lat: 0, lng: 1 },
        to: { lat: 0, lng: 2.5 },
      },
      {
        id: 'c2',
        fromKey: pKey,
        toKey: pointKey(0, 4),
        from: { lat: 0, lng: 2.5 },
        to: { lat: 0, lng: 4 },
      },
    ];

    // delete the third (single-point) component, including its physical nodes
    raw.nodes.delete(pKey);

    const augmented = addManualEdges(raw, connectors);
    const logical = pruneGraph(augmented);
    expect(connectedComponents(logical).length).toBe(1);
  });
});
