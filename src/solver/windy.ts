import type { Graph, Edge } from '../graph/types';
import { connectedComponents } from '../graph/utils';
import { buildEdgeIndex, buildRouteCoords, type CPPResult } from './cpp';
import { directedEdgeCosts, routeMetrics, type ElevationLookup } from './costs';

const GLP_MIN = 1;
const GLP_LO = 2;
const GLP_DB = 4;
const GLP_FX = 5;

export interface WindyLP {
  name: string;
  objective: {
    direction: number;
    name: string;
    vars: { name: string; coef: number }[];
  };
  subjectTo: {
    name: string;
    vars: { name: string; coef: number }[];
    bnds: { type: number; ub: number; lb: number };
  }[];
  bounds: { name: string; type: number; ub: number; lb: number }[];
  generals: string[];
}

export type ILPSolver = (lp: WindyLP) => Promise<Record<string, number>>;

export interface WindyModel {
  lp: WindyLP;
  edgeDir: Map<string, { edge: Edge; from: string; to: string }>;
}

export function buildWindyLP(
  graph: Graph,
  elevationOf: ElevationLookup,
): WindyModel {
  const nodeIdx = new Map<string, number>();
  for (const id of graph.nodes.keys()) {
    nodeIdx.set(id, nodeIdx.size);
  }

  const objectiveVars: { name: string; coef: number }[] = [];
  const cover: WindyLP['subjectTo'] = [];
  const balance = new Map<number, { name: string; coef: number }[]>();
  const bounds: WindyLP['bounds'] = [];
  const generals: string[] = [];
  const edgeDir = new Map<string, { edge: Edge; from: string; to: string }>();

  const addTerm = (idx: number, name: string, coef: number) => {
    if (!balance.has(idx)) balance.set(idx, []);
    balance.get(idx)!.push({ name, coef });
  };

  graph.edges.forEach((edge, i) => {
    const costs = directedEdgeCosts(edge, elevationOf);
    const fName = `e${i}f`;
    const rName = `e${i}r`;

    edgeDir.set(fName, { edge, from: edge.from, to: edge.to });
    edgeDir.set(rName, { edge, from: edge.to, to: edge.from });

    objectiveVars.push({ name: fName, coef: costs.forward });
    objectiveVars.push({ name: rName, coef: costs.reverse });

    generals.push(fName, rName);
    bounds.push({ name: fName, type: GLP_DB, ub: 2, lb: 0 });
    bounds.push({ name: rName, type: GLP_DB, ub: 2, lb: 0 });

    cover.push({
      name: `cover${i}`,
      vars: [
        { name: fName, coef: 1 },
        { name: rName, coef: 1 },
      ],
      bnds: { type: GLP_LO, ub: 0, lb: 1 },
    });

    addTerm(nodeIdx.get(edge.from)!, fName, 1);
    addTerm(nodeIdx.get(edge.to)!, fName, -1);
    addTerm(nodeIdx.get(edge.to)!, rName, 1);
    addTerm(nodeIdx.get(edge.from)!, rName, -1);
  });

  const subjectTo: WindyLP['subjectTo'] = [...cover];
  for (const [idx, terms] of balance) {
    subjectTo.push({
      name: `bal${idx}`,
      vars: terms,
      bnds: { type: GLP_FX, ub: 0, lb: 0 },
    });
  }

  const lp: WindyLP = {
    name: 'windy',
    objective: { direction: GLP_MIN, name: 'obj', vars: objectiveVars },
    subjectTo,
    bounds,
    generals,
  };

  return { lp, edgeDir };
}

export function traversalsFromSolution(
  edgeDir: WindyModel['edgeDir'],
  solution: Record<string, number>,
): Map<string, Map<string, number>> {
  const traversals = new Map<string, Map<string, number>>();

  for (const [name, info] of edgeDir) {
    const count = Math.round(solution[name] ?? 0);
    if (count <= 0) continue;

    if (!traversals.has(info.from)) traversals.set(info.from, new Map());
    const fromMap = traversals.get(info.from)!;
    fromMap.set(info.to, (fromMap.get(info.to) ?? 0) + count);
  }

  return traversals;
}

function directedEulerCircuit(
  adjacency: Map<string, string[]>,
  start: string,
): string[] {
  if (!adjacency.has(start)) {
    for (const [key] of adjacency) {
      return directedEulerCircuit(adjacency, key);
    }
    return [];
  }

  const adj = new Map<string, string[]>();
  for (const [from, targets] of adjacency) {
    adj.set(from, [...targets]);
  }

  const stack: string[] = [start];
  const circuit: string[] = [];

  while (stack.length > 0) {
    const v = stack[stack.length - 1];
    const neighbors = adj.get(v);
    if (neighbors && neighbors.length > 0) {
      stack.push(neighbors.pop()!);
    } else {
      circuit.push(stack.pop()!);
    }
  }

  circuit.reverse();
  return circuit;
}

export function buildRouteFromTraversals(
  graph: Graph,
  start: string,
  traversals: Map<string, Map<string, number>>,
): {
  circuit: string[];
  coords: [number, number][];
  segments: CPPResult['segments'];
  totalDistance: number;
  uniqueDistance: number;
} {
  const adjacency = new Map<string, string[]>();
  for (const [from, targets] of traversals) {
    if (!adjacency.has(from)) adjacency.set(from, []);
    const list = adjacency.get(from)!;
    for (const [to, count] of targets) {
      for (let k = 0; k < count; k++) list.push(to);
    }
  }

  const circuit = directedEulerCircuit(adjacency, start);
  const { coords, segments } = buildRouteCoords(graph, circuit);

  const edgeIndex = buildEdgeIndex(graph);
  let totalDistance = 0;
  for (let i = 0; i < circuit.length - 1; i++) {
    const edge = edgeIndex.get(circuit[i])?.get(circuit[i + 1]);
    if (edge) totalDistance += edge.weight;
  }

  let uniqueDistance = 0;
  for (const edge of graph.edges) {
    uniqueDistance += edge.weight;
  }

  return { circuit, coords, segments, totalDistance, uniqueDistance };
}

export async function solveWindyCPP(
  graph: Graph,
  startNode: string,
  elevationOf: ElevationLookup,
  solveLP: ILPSolver,
): Promise<CPPResult> {
  const components = connectedComponents(graph);
  let warning: string | null = null;
  if (components.length > 1) {
    const unreachable = components.length - 1;
    warning = `${unreachable} disconnected component${unreachable > 1 ? 's' : ''} not reachable from start point.`;
  }

  const { lp, edgeDir } = buildWindyLP(graph, elevationOf);
  const solution = await solveLP(lp);
  const traversals = traversalsFromSolution(edgeDir, solution);

  const { circuit, coords, segments, totalDistance, uniqueDistance } =
    buildRouteFromTraversals(graph, startNode, traversals);

  const metrics = routeMetrics(coords, elevationOf);

  return {
    circuit,
    coords,
    segments,
    totalDistance,
    uniqueDistance,
    warning,
    elevationGain: metrics.ascent,
    elevationLoss: metrics.descent,
    estimatedTime: metrics.time,
  };
}
