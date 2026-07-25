import { pointKey, type Graph, type Node, type Edge } from './types';
import { haversineDistance } from '../utils/geo';

function copyGraph(graph: Graph): Graph {
  const nodes = new Map(graph.nodes);
  const adjacency = new Map<string, Map<string, number>>();
  for (const [id, neighbors] of graph.adjacency) {
    adjacency.set(id, new Map(neighbors));
  }
  const edges = graph.edges.map((e) => ({ ...e, coords: [...e.coords] }));
  return { nodes, edges, adjacency };
}

function degree(graph: Graph, nodeId: string): number {
  return graph.adjacency.get(nodeId)?.size ?? 0;
}

function findEdge(graph: Graph, from: string, to: string): Edge | undefined {
  return graph.edges.find(
    (e) =>
      (e.from === from && e.to === to) ||
      (e.from === to && e.to === from)
  );
}

function removeEdge(graph: Graph, edge: Edge) {
  const idx = graph.edges.indexOf(edge);
  if (idx >= 0) graph.edges.splice(idx, 1);

  graph.adjacency.get(edge.from)?.delete(edge.to);
  graph.adjacency.get(edge.to)?.delete(edge.from);
  if (graph.adjacency.get(edge.from)?.size === 0) graph.adjacency.delete(edge.from);
  if (graph.adjacency.get(edge.to)?.size === 0) graph.adjacency.delete(edge.to);
}

function addEdge(graph: Graph, from: string, to: string, coords: [number, number][], weight: number) {
  const edge: Edge = { from, to, weight, coords };
  graph.edges.push(edge);

  if (!graph.adjacency.has(from)) graph.adjacency.set(from, new Map());
  if (!graph.adjacency.has(to)) graph.adjacency.set(to, new Map());

  const existing = graph.adjacency.get(from)!.get(to);
  if (existing === undefined || weight < existing) {
    graph.adjacency.get(from)!.set(to, weight);
    graph.adjacency.get(to)!.set(from, weight);
  }
}

function joinCoords(
  e1: Edge, e2: Edge, commonNode: string
): [number, number][] {
  const c1 = [...e1.coords];
  const c2 = [...e2.coords];

  if (e1.to === commonNode) {
    if (e2.from === commonNode) {
      return [...c1, ...c2.slice(1)];
    }
    return [...c1, ...c2.reverse().slice(1)];
  }

  if (e1.from === commonNode) {
    if (e2.from === commonNode) {
      return [...c1.reverse(), ...c2.slice(1)];
    }
    return [...c1.reverse(), ...c2.reverse().slice(1)];
  }

  return [...c1, ...c2.slice(1)];
}

export function pruneGraph(input: Graph): Graph {
  const graph = copyGraph(input);
  let changed = true;

  while (changed) {
    changed = false;

    const degree2Nodes: string[] = [];
    for (const [id] of graph.nodes) {
      if (degree(graph, id) === 2) {
        degree2Nodes.push(id);
      }
    }

    for (const nodeId of degree2Nodes) {
      if (degree(graph, nodeId) !== 2) continue;

      const neighbors = Array.from(graph.adjacency.get(nodeId)!.keys());

      if (neighbors.length !== 2) continue;

      const n1 = neighbors[0];
      const n2 = neighbors[1];

      if (n1 === n2) continue;

      const e1 = findEdge(graph, nodeId, n1);
      const e2 = findEdge(graph, nodeId, n2);
      if (!e1 || !e2) continue;

      const combinedCoords = joinCoords(e1, e2, nodeId);
      let combinedWeight = 0;
      for (let i = 1; i < combinedCoords.length; i++) {
        combinedWeight += haversineDistance(
          combinedCoords[i - 1][1], combinedCoords[i - 1][0],
          combinedCoords[i][1], combinedCoords[i][0]
        );
      }

      removeEdge(graph, e1);
      removeEdge(graph, e2);
      graph.nodes.delete(nodeId);

      addEdge(graph, n1, n2, combinedCoords, combinedWeight);

      changed = true;
    }
  }

  return graph;
}
