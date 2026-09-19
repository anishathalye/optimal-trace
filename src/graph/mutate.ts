import { type Graph, type ManualConnector } from './types';
import { PHYSICAL_EDGE_PREFIX, edgeIdKey } from './types';
import type { GeoJSONFeature } from '../hooks/useOverpass';
import buildGraph from './build';
import { pruneGraph } from './prune';
import { haversineDistance } from '../utils/geo';

function rebuildGraph(graph: Graph, newEdges: typeof graph.edges): Graph {
  const nodes = new Map(graph.nodes);
  const adjacency = new Map<string, Map<string, number>>();
  for (const edge of newEdges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Map());
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Map());
    const existing = adjacency.get(edge.from)!.get(edge.to);
    if (existing === undefined || edge.weight < existing) {
      adjacency.get(edge.from)!.set(edge.to, edge.weight);
      adjacency.get(edge.to)!.set(edge.from, edge.weight);
    }
  }
  for (const [id] of nodes) {
    if (!adjacency.has(id)) nodes.delete(id);
  }
  return { nodes, edges: newEdges, adjacency };
}

export function removeRawEdge(rawGraph: Graph, edgeId: string): Graph {
  const newEdges = rawGraph.edges.filter(
    (e) => edgeIdKey(e.from, e.to) !== edgeId,
  );
  if (newEdges.length === rawGraph.edges.length) return rawGraph;
  return rebuildGraph(rawGraph, newEdges);
}

export function removeEdgeById(
  rawGraph: Graph,
  logicalGraph: Graph | null,
  edgeId: string,
): Graph {
  if (edgeId.startsWith(PHYSICAL_EDGE_PREFIX)) {
    return removeRawEdge(rawGraph, edgeId.slice(PHYSICAL_EDGE_PREFIX.length));
  }
  return removeLogicalEdge(rawGraph, logicalGraph, edgeId);
}

export function applyRemovals(
  rawGraph: Graph,
  removedIds: Iterable<string>,
): Graph {
  let raw = rawGraph;
  let logical = pruneGraph(raw);

  for (const id of removedIds) {
    raw = removeEdgeById(raw, logical, id);
    logical = pruneGraph(raw);
  }

  return raw;
}

export function buildGraphWithRemovals(
  features: GeoJSONFeature[],
  removedIds: Iterable<string>,
): Graph {
  return applyRemovals(buildGraph(features), removedIds);
}

// Removes a whole batch of erased ids (logical edge ids, or "physical:"
// prefixed raw edge ids) against a single logical graph and rebuilds once.
// This matches applying the ids sequentially as long as the batch does not
// repeat the same logical edge, which the eraser guarantees within a gesture.
export function removeBatch(
  rawGraph: Graph,
  logicalGraph: Graph | null,
  removedIds: Iterable<string>,
): Graph {
  const removablePairs = new Set<string>();
  const physicalIds = new Set<string>();

  for (const id of removedIds) {
    if (id.startsWith(PHYSICAL_EDGE_PREFIX)) {
      physicalIds.add(id.slice(PHYSICAL_EDGE_PREFIX.length));
      continue;
    }
    if (!logicalGraph) continue;

    const logicalEdge = logicalGraph.edges.find(
      (e) => edgeIdKey(e.from, e.to) === id,
    );
    if (!logicalEdge) continue;

    // Only remove raw edges along the erased logical edge's polyline, i.e.
    // whose endpoints are CONSECUTIVE vertices, so unrelated chords sharing
    // two junction vertices are kept.
    const chain = logicalEdge.coords.map(
      ([lng, lat]) => `${lat.toFixed(6)},${lng.toFixed(6)}`,
    );
    for (let i = 0; i + 1 < chain.length; i++) {
      removablePairs.add(edgeIdKey(chain[i], chain[i + 1]));
    }
  }

  if (removablePairs.size === 0 && physicalIds.size === 0) return rawGraph;

  const newEdges = rawGraph.edges.filter((e) => {
    const pair = edgeIdKey(e.from, e.to);
    if (physicalIds.has(pair)) return false;
    const fromNode = rawGraph.nodes.get(e.from);
    const toNode = rawGraph.nodes.get(e.to);
    if (!fromNode || !toNode) return true;
    const fromKey = `${fromNode.lat.toFixed(6)},${fromNode.lng.toFixed(6)}`;
    const toKey = `${toNode.lat.toFixed(6)},${toNode.lng.toFixed(6)}`;
    return !removablePairs.has(edgeIdKey(fromKey, toKey));
  });

  if (newEdges.length === rawGraph.edges.length) return rawGraph;

  return rebuildGraph(rawGraph, newEdges);
}

export function applyRemovalBatches(
  rawGraph: Graph,
  batches: Iterable<Iterable<string>>,
): Graph {
  let raw = rawGraph;
  for (const batch of batches) {
    const logical = pruneGraph(raw);
    raw = removeBatch(raw, logical, batch);
  }
  return raw;
}

export function removeLogicalEdge(
  rawGraph: Graph,
  logicalGraph: Graph | null,
  logicalEdgeId: string,
): Graph {
  if (!logicalGraph) return rawGraph;

  const logicalEdge = logicalGraph.edges.find(
    (e) => edgeIdKey(e.from, e.to) === logicalEdgeId,
  );

  if (!logicalEdge) return rawGraph;

  // Only remove raw edges that lie along the erased logical edge, i.e. whose
  // endpoints are CONSECUTIVE vertices of its polyline. Matching any edge
  // with both endpoints anywhere in the coordinate set would also delete
  // unrelated chords sharing two junction vertices.
  const chain = logicalEdge.coords.map(
    ([lng, lat]) => `${lat.toFixed(6)},${lng.toFixed(6)}`,
  );
  const removablePairs = new Set<string>();
  for (let i = 0; i + 1 < chain.length; i++) {
    removablePairs.add(edgeIdKey(chain[i], chain[i + 1]));
  }

  const newEdges = rawGraph.edges.filter((e) => {
    const fromNode = rawGraph.nodes.get(e.from);
    const toNode = rawGraph.nodes.get(e.to);
    if (!fromNode || !toNode) return true;
    const fromKey = `${fromNode.lat.toFixed(6)},${fromNode.lng.toFixed(6)}`;
    const toKey = `${toNode.lat.toFixed(6)},${toNode.lng.toFixed(6)}`;
    return !removablePairs.has(edgeIdKey(fromKey, toKey));
  });

  if (newEdges.length === rawGraph.edges.length) return rawGraph;

  return rebuildGraph(rawGraph, newEdges);
}

export function addManualEdge(graph: Graph, connector: ManualConnector): Graph {
  const { fromKey, toKey, from, to } = connector;

  if (fromKey === toKey) return graph;

  const key = edgeIdKey(fromKey, toKey);
  if (graph.edges.some((e) => edgeIdKey(e.from, e.to) === key)) return graph;

  const weight = haversineDistance(from.lat, from.lng, to.lat, to.lng);
  if (weight < 0.1) return graph;

  const coords: [number, number][] = [
    [from.lng, from.lat],
    [to.lng, to.lat],
  ];

  const nodes = new Map(graph.nodes);
  if (!nodes.has(fromKey)) nodes.set(fromKey, { lat: from.lat, lng: from.lng });
  if (!nodes.has(toKey)) nodes.set(toKey, { lat: to.lat, lng: to.lng });

  const newEdges = [
    ...graph.edges,
    { from: fromKey, to: toKey, weight, coords },
  ];
  return rebuildGraph(
    { nodes, edges: graph.edges, adjacency: graph.adjacency },
    newEdges,
  );
}

export function addManualEdges(
  graph: Graph,
  connectors: ManualConnector[],
): Graph {
  let result = graph;
  for (const connector of connectors) {
    result = addManualEdge(result, connector);
  }
  return result;
}
