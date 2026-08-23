import type { Graph, Edge } from './types';
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

function findEdge(graph: Graph, from: string, to: string): Edge | undefined {
  return graph.edges.find(
    (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from),
  );
}

function joinCoords(
  e1: Edge,
  e2: Edge,
  commonNode: string,
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

export function pruneGraph(input: Graph, preserveKey?: string): Graph {
  const graph = copyGraph(input);

  // True degree counts every incident edge (parallel edges between the same
  // node pair each count). Adjacency-key size undercounts on multigraphs.
  const degree = new Map<string, number>();
  const incident = new Map<string, Edge[]>();
  for (const edge of graph.edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    if (!incident.has(edge.from)) incident.set(edge.from, []);
    if (!incident.has(edge.to)) incident.set(edge.to, []);
    incident.get(edge.from)!.push(edge);
    incident.get(edge.to)!.push(edge);
  }

  function otherEnd(edge: Edge, nodeId: string): string {
    return edge.from === nodeId ? edge.to : edge.from;
  }

  // Keep the adjacency weight equal to the minimum weight among the remaining
  // edges between a pair (removing one parallel edge may raise the min).
  function refreshAdjacency(u: string, v: string) {
    let best: number | undefined;
    for (const e of incident.get(u) ?? []) {
      if (otherEnd(e, u) !== v) continue;
      if (best === undefined || e.weight < best) best = e.weight;
    }
    const mapU = graph.adjacency.get(u);
    const mapV = graph.adjacency.get(v);
    if (best === undefined) {
      mapU?.delete(v);
      if (mapU?.size === 0) graph.adjacency.delete(u);
      mapV?.delete(u);
      if (mapV?.size === 0) graph.adjacency.delete(v);
    } else {
      mapU?.set(v, best);
      mapV?.set(u, best);
    }
  }

  function removeEdge(edge: Edge) {
    const idx = graph.edges.indexOf(edge);
    if (idx >= 0) graph.edges.splice(idx, 1);

    for (const end of [edge.from, edge.to]) {
      const list = incident.get(end);
      if (list) {
        const i = list.indexOf(edge);
        if (i >= 0) list.splice(i, 1);
      }
      const d = (degree.get(end) ?? 1) - 1;
      if (d <= 0) degree.delete(end);
      else degree.set(end, d);
    }

    refreshAdjacency(edge.from, edge.to);
  }

  function addEdge(
    from: string,
    to: string,
    coords: [number, number][],
    weight: number,
  ) {
    const edge: Edge = { from, to, weight, coords };
    graph.edges.push(edge);

    degree.set(from, (degree.get(from) ?? 0) + 1);
    degree.set(to, (degree.get(to) ?? 0) + 1);
    if (!incident.has(from)) incident.set(from, []);
    if (!incident.has(to)) incident.set(to, []);
    incident.get(from)!.push(edge);
    incident.get(to)!.push(edge);

    if (!graph.adjacency.has(from)) graph.adjacency.set(from, new Map());
    if (!graph.adjacency.has(to)) graph.adjacency.set(to, new Map());

    const existing = graph.adjacency.get(from)!.get(to);
    if (existing === undefined || weight < existing) {
      graph.adjacency.get(from)!.set(to, weight);
      graph.adjacency.get(to)!.set(from, weight);
    }
  }

  let changed = true;

  while (changed) {
    changed = false;

    const degree2Nodes: string[] = [];
    for (const id of graph.nodes.keys()) {
      if (degree.get(id) === 2 && !(preserveKey && id === preserveKey)) {
        degree2Nodes.push(id);
      }
    }

    for (const nodeId of degree2Nodes) {
      if (degree.get(nodeId) !== 2) continue;

      const edgesAtNode = incident.get(nodeId) ?? [];
      if (edgesAtNode.length !== 2) continue;

      const [e1, e2] = edgesAtNode;
      const n1 = otherEnd(e1, nodeId);
      const n2 = otherEnd(e2, nodeId);

      if (n1 === n2) continue;

      if (findEdge(graph, n1, n2)) continue;

      const combinedCoords = joinCoords(e1, e2, nodeId);
      let combinedWeight = 0;
      for (let i = 1; i < combinedCoords.length; i++) {
        combinedWeight += haversineDistance(
          combinedCoords[i - 1][1],
          combinedCoords[i - 1][0],
          combinedCoords[i][1],
          combinedCoords[i][0],
        );
      }

      removeEdge(e1);
      removeEdge(e2);
      graph.nodes.delete(nodeId);

      addEdge(n1, n2, combinedCoords, combinedWeight);

      changed = true;
    }
  }

  return graph;
}
