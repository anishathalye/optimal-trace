import { type Graph } from './types';
import type { GeoJSONFeature } from '../hooks/useOverpass';
import buildGraph from './build';
import { pruneGraph } from './prune';

export function buildGraphWithRemovals(
  features: GeoJSONFeature[],
  removedIds: Iterable<string>,
): Graph {
  let raw = buildGraph(features);
  let logical = pruneGraph(raw);

  for (const id of removedIds) {
    raw = removeLogicalEdge(raw, logical, id);
    logical = pruneGraph(raw);
  }

  return raw;
}

export function removeLogicalEdge(
  rawGraph: Graph,
  logicalGraph: Graph | null,
  logicalEdgeId: string,
): Graph {
  if (!logicalGraph) return rawGraph;

  const logicalEdge = logicalGraph.edges.find((e) => {
    const key = e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
    return key === logicalEdgeId;
  });

  if (!logicalEdge) return rawGraph;

  const coordSet = new Set(
    logicalEdge.coords.map(
      ([lng, lat]) => `${lat.toFixed(6)},${lng.toFixed(6)}`,
    ),
  );

  const newEdges = rawGraph.edges.filter((e) => {
    const fromKey = `${rawGraph.nodes.get(e.from)!.lat.toFixed(6)},${rawGraph.nodes.get(e.from)!.lng.toFixed(6)}`;
    const toKey = `${rawGraph.nodes.get(e.to)!.lat.toFixed(6)},${rawGraph.nodes.get(e.to)!.lng.toFixed(6)}`;
    return !(coordSet.has(fromKey) && coordSet.has(toKey));
  });

  if (newEdges.length === rawGraph.edges.length) return rawGraph;

  const nodes = new Map(rawGraph.nodes);
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
