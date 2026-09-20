import { describe, it, expect } from 'vitest';
import buildGraph from '../graph/build';
import { pruneGraph } from '../graph/prune';
import { removeBatch, applyRemovals } from '../graph/mutate';
import { graphToFeatures, featureToPhysicalEdgeIds } from '../graph/features';
import { PHYSICAL_EDGE_PREFIX, edgeIdKey } from '../graph/types';
import type { Graph } from '../graph/types';
import type { GeoJSONFeature } from '../hooks/useOverpass';

function makeFeature(coords: [number, number][]): GeoJSONFeature {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: {},
  };
}

function pairs(graph: Graph): string[] {
  return graph.edges.map((e) => edgeIdKey(e.from, e.to)).sort();
}

describe('featureToPhysicalEdgeIds', () => {
  it('expands a merged logical feature into its raw edges', () => {
    // A--m--B: m is degree 2, so it is pruned into one logical edge A-B that
    // still carries the intermediate vertex in its coordinates.
    const raw = buildGraph([
      makeFeature([
        [0, 0],
        [0.5, 0],
        [1, 0],
      ]),
    ]);
    const logical = pruneGraph(raw);
    expect(logical.edges.length).toBe(1);

    const collection = graphToFeatures(logical);
    const feature = collection.features[0];
    const logicalId = String(feature.id);

    const physical = featureToPhysicalEdgeIds(feature, logicalId);
    expect(physical).toHaveLength(2);
    expect(physical.every((id) => id.startsWith(PHYSICAL_EDGE_PREFIX))).toBe(
      true,
    );

    // Erasing via the expanded physical ids must remove exactly what erasing
    // the logical id removes.
    const viaLogical = removeBatch(raw, logical, [logicalId]);
    const viaPhysical = removeBatch(raw, logical, physical);
    expect(pairs(viaPhysical)).toEqual(pairs(viaLogical));
  });

  it('replays physical ids identically to a fresh save/load', () => {
    const features = [
      makeFeature([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
      makeFeature([
        [1, 0],
        [1, 1],
      ]),
    ];
    const raw = buildGraph(features);
    const logical = pruneGraph(raw);
    const collection = graphToFeatures(logical);

    // Erase two logical features in one gesture, as the app does.
    const ids = collection.features.flatMap((feature) =>
      featureToPhysicalEdgeIds(feature, String(feature.id)),
    );

    const runtime = removeBatch(raw, logical, ids);
    const reloaded = applyRemovals(raw, ids);
    expect(pairs(reloaded)).toEqual(pairs(runtime));
  });

  it('passes through physical ids and falls back for unknown features', () => {
    const id = `${PHYSICAL_EDGE_PREFIX}abc|def`;
    expect(featureToPhysicalEdgeIds(undefined, id)).toEqual([id]);
    expect(featureToPhysicalEdgeIds(undefined, 'logical|edge')).toEqual([
      'logical|edge',
    ]);
  });
});
