function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function pointKey(lat: number, lng: number): string {
  return `${round(lat)},${round(lng)}`;
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
