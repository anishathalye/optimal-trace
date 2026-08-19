function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function pointKey(lat: number, lng: number): string {
  return `${round(lat)},${round(lng)}`;
}

export const PHYSICAL_EDGE_PREFIX = 'physical:';

export function edgeIdKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface Node {
  lat: number;
  lng: number;
}

export interface Edge {
  from: string;
  to: string;
  weight: number;
  coords: [number, number][];
}

export interface Graph {
  nodes: Map<string, Node>;
  edges: Edge[];
  adjacency: Map<string, Map<string, number>>;
}

export interface ManualConnector {
  id: string;
  fromKey: string;
  toKey: string;
  from: Node;
  to: Node;
}
