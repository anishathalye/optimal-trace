import type { Graph, Edge } from '../graph/types';
import { oddDegreeNodes, connectedComponents } from '../graph/utils';
import { dijkstra, reconstructPath } from './dijkstra';
import blossom from './blossom';

interface PathInfo {
  distance: number;
  path: string[];
}

type AllPairs = Map<string, Map<string, PathInfo>>;

function allPairsShortestPaths(graph: Graph, nodes: string[]): AllPairs {
  const result: AllPairs = new Map();

  for (const source of nodes) {
    result.set(source, new Map());
    const { distances, previous } = dijkstra(graph, source);

    for (const target of nodes) {
      if (target === source) continue;
      const distance = distances.get(target) ?? Infinity;
      const path = distance < Infinity ? reconstructPath(previous, target) : [];
      result.get(source)!.set(target, { distance, path });
    }
  }

  return result;
}

function matchOddNodes(
  oddNodes: string[],
  allPairs: AllPairs,
): [string, string][] {
  const n = oddNodes.length;
  if (n === 0) return [];
  if (n === 2) return [[oddNodes[0], oddNodes[1]]];

  let maxDist = 0;
  const distances: number[][] = Array.from({ length: n }, () =>
    new Array(n).fill(Infinity),
  );

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const info = allPairs.get(oddNodes[i]);
      const d = info?.get(oddNodes[j])?.distance ?? Infinity;
      if (d < Infinity && d > maxDist) maxDist = d;
      distances[i][j] = d;
      distances[j][i] = d;
    }
  }

  const MAX = Math.round(maxDist) + 1;
  const blossomEdges: [number, number, number][] = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = distances[i][j];
      if (d < Infinity) {
        const weight = Math.round(MAX - d);
        blossomEdges.push([i, j, weight]);
      }
    }
  }

  const matchResult: number[] = blossom(blossomEdges, true);

  const pairs: [string, string][] = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    const j = matchResult[i];
    if (j >= 0 && j < n && !used.has(i) && !used.has(j)) {
      pairs.push([oddNodes[i], oddNodes[j]]);
      used.add(i);
      used.add(j);
    }
  }

  return pairs;
}

function addEdgeCount(
  counts: Map<string, Map<string, number>>,
  u: string,
  v: string,
  delta: number,
) {
  if (!counts.has(u)) counts.set(u, new Map());
  if (!counts.has(v)) counts.set(v, new Map());

  const prevU = counts.get(u)!.get(v) ?? 0;
  const prevV = counts.get(v)!.get(u) ?? 0;
  counts.get(u)!.set(v, prevU + delta);
  counts.get(v)!.set(u, prevV + delta);
}

function decrementEdge(
  adj: Map<string, Map<string, number>>,
  u: string,
  v: string,
) {
  const countU = adj.get(u)?.get(v) ?? 0;
  const countV = adj.get(v)?.get(u) ?? 0;

  if (countU <= 1) {
    adj.get(u)!.delete(v);
    if (adj.get(u)!.size === 0) adj.delete(u);
  } else {
    adj.get(u)!.set(v, countU - 1);
  }

  if (countV <= 1) {
    adj.get(v)!.delete(u);
    if (adj.get(v)!.size === 0) adj.delete(v);
  } else {
    adj.get(v)!.set(u, countV - 1);
  }
}

function cloneEdgeCounts(
  source: Map<string, Map<string, number>>,
): Map<string, Map<string, number>> {
  const clone = new Map<string, Map<string, number>>();
  for (const [u, neighbors] of source) {
    clone.set(u, new Map(neighbors));
  }
  return clone;
}

function eulerCircuit(
  augmented: Map<string, Map<string, number>>,
  start: string,
): string[] {
  if (!augmented.has(start)) {
    for (const [key] of augmented) {
      return eulerCircuit(augmented, key);
    }
    return [];
  }

  const adj = cloneEdgeCounts(augmented);
  const stack: string[] = [start];
  const circuit: string[] = [];

  while (stack.length > 0) {
    const v = stack[stack.length - 1];
    const neighbors = adj.get(v);

    if (neighbors && neighbors.size > 0) {
      const u = neighbors.keys().next().value!;
      decrementEdge(adj, v, u);
      stack.push(u);
    } else {
      circuit.push(stack.pop()!);
    }
  }

  circuit.reverse();
  return circuit;
}

function buildEdgeIndex(graph: Graph): Map<string, Map<string, Edge>> {
  const index = new Map<string, Map<string, Edge>>();

  for (const edge of graph.edges) {
    if (!index.has(edge.from)) index.set(edge.from, new Map());
    if (!index.has(edge.to)) index.set(edge.to, new Map());
    index.get(edge.from)!.set(edge.to, edge);
    index.get(edge.to)!.set(edge.from, edge);
  }

  return index;
}

export interface RouteSegment {
  coords: [number, number][];
  retraced: boolean;
}

export interface CPPResult {
  circuit: string[];
  coords: [number, number][];
  segments: RouteSegment[];
  totalDistance: number;
  uniqueDistance: number;
  warning: string | null;
}

export function solveCPP(graph: Graph, startNode: string): CPPResult {
  const components = connectedComponents(graph);
  let warning: string | null = null;
  if (components.length > 1) {
    const unreachable = components.length - 1;
    warning = `${unreachable} disconnected component${unreachable > 1 ? 's' : ''} not reachable from start point.`;
  }

  const oddNodes = oddDegreeNodes(graph);

  const allPairs = allPairsShortestPaths(graph, oddNodes);
  const matching = matchOddNodes(oddNodes, allPairs);

  const augmented = new Map<string, Map<string, number>>();
  for (const edge of graph.edges) {
    addEdgeCount(augmented, edge.from, edge.to, 1);
  }

  for (const [u, v] of matching) {
    const path = allPairs.get(u)?.get(v)?.path;
    if (!path || path.length < 2) continue;
    for (let i = 0; i < path.length - 1; i++) {
      addEdgeCount(augmented, path[i], path[i + 1], 1);
    }
  }

  const circuit = eulerCircuit(augmented, startNode);
  const edgeIndex = buildEdgeIndex(graph);

  const coords: [number, number][] = [];
  const segments: RouteSegment[] = [];
  const traversed = new Set<string>();

  for (let i = 0; i < circuit.length - 1; i++) {
    const u = circuit[i];
    const v = circuit[i + 1];
    const edge = edgeIndex.get(u)?.get(v);

    if (edge) {
      const edgeCoords = edge.coords;
      const isForward = edge.from === u && edge.to === v;
      const edgeKey = u < v ? `${u}|${v}` : `${v}|${u}`;
      const retraced = traversed.has(edgeKey);
      traversed.add(edgeKey);

      const segCoords: [number, number][] = [];

      if (isForward) {
        segCoords.push(...edgeCoords);
        for (let j = 0; j < edgeCoords.length; j++) {
          if (
            coords.length === 0 ||
            coords[coords.length - 1][0] !== edgeCoords[j][0] ||
            coords[coords.length - 1][1] !== edgeCoords[j][1]
          ) {
            coords.push(edgeCoords[j]);
          }
        }
      } else {
        const reversed = [...edgeCoords].reverse();
        segCoords.push(...reversed);
        for (let j = 0; j < reversed.length; j++) {
          if (
            coords.length === 0 ||
            coords[coords.length - 1][0] !== reversed[j][0] ||
            coords[coords.length - 1][1] !== reversed[j][1]
          ) {
            coords.push(reversed[j]);
          }
        }
      }

      if (segCoords.length >= 2) {
        segments.push({ coords: segCoords, retraced });
      }
    }
  }

  let totalDistance = 0;
  for (const edge of graph.edges) {
    totalDistance += edge.weight;
  }
  for (const [u, v] of matching) {
    const info = allPairs.get(u)?.get(v);
    if (info) totalDistance += info.distance;
  }

  let uniqueDistance = 0;
  for (const edge of graph.edges) {
    uniqueDistance += edge.weight;
  }

  return { circuit, coords, segments, totalDistance, uniqueDistance, warning };
}
