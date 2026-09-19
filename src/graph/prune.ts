import type { Graph, Edge } from './types';
import { haversineDistance } from '../utils/geo';

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
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
  const nodes = new Map(input.nodes);

  // Active edges, incidence, true degree (parallel edges count individually),
  // and a count of edges per unordered node pair. Using sets/maps here keeps
  // edge removal and "is there already an edge between n1 and n2?" O(1),
  // instead of scanning the edge list (which made pruning O(E^2)).
  const active = new Set<Edge>();
  const incident = new Map<string, Set<Edge>>();
  const degree = new Map<string, number>();
  const pairCount = new Map<string, number>();

  function addActive(edge: Edge) {
    active.add(edge);
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
    if (!incident.has(edge.from)) incident.set(edge.from, new Set());
    if (!incident.has(edge.to)) incident.set(edge.to, new Set());
    incident.get(edge.from)!.add(edge);
    incident.get(edge.to)!.add(edge);
    const key = pairKey(edge.from, edge.to);
    pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
  }

  function removeActive(edge: Edge) {
    if (!active.delete(edge)) return;
    for (const end of [edge.from, edge.to]) {
      incident.get(end)?.delete(edge);
      const d = (degree.get(end) ?? 1) - 1;
      if (d <= 0) degree.delete(end);
      else degree.set(end, d);
    }
    const key = pairKey(edge.from, edge.to);
    const count = (pairCount.get(key) ?? 1) - 1;
    if (count <= 0) pairCount.delete(key);
    else pairCount.set(key, count);
  }

  for (const edge of input.edges) addActive(edge);

  let changed = true;

  while (changed) {
    changed = false;

    for (const nodeId of [...nodes.keys()]) {
      if (preserveKey && nodeId === preserveKey) continue;
      if (degree.get(nodeId) !== 2) continue;

      const edgesAtNode = incident.get(nodeId);
      if (!edgesAtNode || edgesAtNode.size !== 2) continue;

      const [e1, e2] = [...edgesAtNode];
      const n1 = e1.from === nodeId ? e1.to : e1.from;
      const n2 = e2.from === nodeId ? e2.to : e2.from;

      if (n1 === n2) continue;

      if (pairCount.has(pairKey(n1, n2))) continue;

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

      removeActive(e1);
      removeActive(e2);
      nodes.delete(nodeId);

      addActive({
        from: n1,
        to: n2,
        weight: combinedWeight,
        coords: combinedCoords,
      });

      changed = true;
    }
  }

  const edges = [...active];
  const adjacency = new Map<string, Map<string, number>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Map());
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Map());
    const fromMap = adjacency.get(edge.from)!;
    const existing = fromMap.get(edge.to);
    if (existing === undefined || edge.weight < existing) {
      fromMap.set(edge.to, edge.weight);
      adjacency.get(edge.to)!.set(edge.from, edge.weight);
    }
  }

  for (const id of [...nodes.keys()]) {
    if (!adjacency.has(id)) nodes.delete(id);
  }

  return { nodes, edges, adjacency };
}
