import type { Graph } from '../graph/types';

export function dijkstra(
  graph: Graph,
  source: string,
): { distances: Map<string, number>; previous: Map<string, string | null> } {
  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const visited = new Set<string>();

  for (const nodeId of graph.nodes.keys()) {
    distances.set(nodeId, Infinity);
    previous.set(nodeId, null);
  }
  distances.set(source, 0);

  const queue = new Map<string, number>();
  queue.set(source, 0);

  while (queue.size > 0) {
    let minNode = '';
    let minDist = Infinity;
    for (const [node, dist] of queue) {
      if (dist < minDist) {
        minDist = dist;
        minNode = node;
      }
    }

    queue.delete(minNode);
    if (visited.has(minNode)) continue;
    visited.add(minNode);

    const neighbors = graph.adjacency.get(minNode);
    if (!neighbors) continue;

    for (const [neighbor, weight] of neighbors) {
      if (visited.has(neighbor)) continue;
      const alt = distances.get(minNode)! + weight;
      if (alt < (distances.get(neighbor) ?? Infinity)) {
        distances.set(neighbor, alt);
        previous.set(neighbor, minNode);
        queue.set(neighbor, alt);
      }
    }
  }

  return { distances, previous };
}

export function reconstructPath(
  previous: Map<string, string | null>,
  target: string,
): string[] {
  const path: string[] = [];
  let current: string | null = target;
  while (current !== null) {
    path.push(current);
    current = previous.get(current) ?? null;
  }
  path.reverse();
  return path;
}
