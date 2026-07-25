import type { Graph } from './types';

export function connectedComponents(graph: Graph): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const nodeId of graph.nodes.keys()) {
    if (visited.has(nodeId)) continue;

    const component: string[] = [];
    const stack = [nodeId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);

      const neighbors = graph.adjacency.get(current);
      if (neighbors) {
        for (const neighbor of neighbors.keys()) {
          if (!visited.has(neighbor)) {
            stack.push(neighbor);
          }
        }
      }
    }

    components.push(component);
  }

  return components;
}

export function oddDegreeNodes(graph: Graph): string[] {
  const odd: string[] = [];
  for (const [nodeId, neighbors] of graph.adjacency) {
    if (neighbors.size % 2 !== 0) {
      odd.push(nodeId);
    }
  }
  return odd;
}

export function totalEdgeDistance(graph: Graph): number {
  let total = 0;
  for (const edge of graph.edges) {
    total += edge.weight;
  }
  return total;
}
