import { type Graph } from './types';
import { pointKey } from './types';

export function findPathNodes(graph: Graph, from: string, to: string): string[] {
  const queue: string[][] = [[from]];
  const visited = new Set<string>([from]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    const neighbors = graph.adjacency.get(current);
    if (!neighbors) continue;

    for (const neighbor of neighbors.keys()) {
      if (neighbor === to) {
        return [...path, neighbor];
      }
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }

  return [];
}

function edgeKey(e: { from: string; to: string }): string {
  return e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`;
}

export function removeLogicalEdge(graph: Graph, logicalEdgeId: string): Graph {
  const [from, to] = logicalEdgeId.split('|');

  const pathNodes = findPathNodes(graph, from, to);
  if (pathNodes.length < 2) return graph;

  const pathSet = new Set(pathNodes);

  const newEdges = graph.edges.filter((e) => {
    const onPath = pathSet.has(e.from) && pathSet.has(e.to);
    return !onPath;
  });

  if (newEdges.length === graph.edges.length) return graph;

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
