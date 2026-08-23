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
  // Count true edge degree (parallel edges each count), not unique-neighbour
  // count, so parity is correct for multigraphs.
  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  const odd: string[] = [];
  for (const [nodeId, d] of degree) {
    if (d % 2 !== 0) {
      odd.push(nodeId);
    }
  }
  return odd;
}

export function unreachableComponentCount(
  components: string[][],
  startNode: string,
): number {
  if (components.length <= 1) return 0;

  let reachable = false;
  let unreachable = 0;
  for (const component of components) {
    if (component.includes(startNode)) {
      reachable = true;
    } else {
      unreachable++;
    }
  }
  return reachable ? unreachable : components.length;
}

export function totalEdgeDistance(graph: Graph): number {
  let total = 0;
  for (const edge of graph.edges) {
    total += edge.weight;
  }
  return total;
}
