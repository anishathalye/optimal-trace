import type { Graph } from '../graph/types';

// Binary min-heap with lazy deletion: stale entries are skipped via the
// visited set, so decrease-key is just "push again".
class MinHeap {
  private keys: number[] = [];
  private vals: string[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(val: string, key: number): void {
    this.keys.push(key);
    this.vals.push(val);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= this.keys[i]) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): string | undefined {
    if (this.keys.length === 0) return undefined;
    const top = this.vals[0];
    const lastKey = this.keys.pop()!;
    const lastVal = this.vals.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.vals[0] = lastVal;
      let i = 0;
      const n = this.keys.length;
      while (true) {
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        let smallest = i;
        if (left < n && this.keys[left] < this.keys[smallest]) smallest = left;
        if (right < n && this.keys[right] < this.keys[smallest])
          smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const k = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = k;
    const v = this.vals[a];
    this.vals[a] = this.vals[b];
    this.vals[b] = v;
  }
}

export function dijkstra(
  graph: Graph,
  source: string,
  cost?: (from: string, to: string) => number,
): { distances: Map<string, number>; previous: Map<string, string | null> } {
  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const visited = new Set<string>();

  for (const nodeId of graph.nodes.keys()) {
    distances.set(nodeId, Infinity);
    previous.set(nodeId, null);
  }
  distances.set(source, 0);

  const heap = new MinHeap();
  heap.push(source, 0);

  while (heap.size > 0) {
    const minNode = heap.pop()!;
    if (visited.has(minNode)) continue;
    visited.add(minNode);

    const neighbors = graph.adjacency.get(minNode);
    if (!neighbors) continue;

    const dist = distances.get(minNode)!;
    for (const [neighbor, defaultWeight] of neighbors) {
      if (visited.has(neighbor)) continue;
      const weight = cost ? cost(minNode, neighbor) : defaultWeight;
      const alt = dist + weight;
      if (alt < (distances.get(neighbor) ?? Infinity)) {
        distances.set(neighbor, alt);
        previous.set(neighbor, minNode);
        heap.push(neighbor, alt);
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
