import type { Graph } from './types';
import { PHYSICAL_EDGE_PREFIX, edgeIdKey, pointKey } from './types';
import type {
  GeoJSONFeatureCollection,
  GeoJSONFeature,
} from '../hooks/useOverpass';

function buildFeatures(graph: Graph, prefix: string): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = graph.edges.map((edge) => {
    const id = `${prefix}${edgeIdKey(edge.from, edge.to)}`;
    return {
      type: 'Feature' as const,
      id,
      geometry: {
        type: 'LineString' as const,
        coordinates: edge.coords,
      },
      properties: {},
    };
  });

  return { type: 'FeatureCollection', features };
}

export function graphToFeatures(graph: Graph): GeoJSONFeatureCollection {
  return buildFeatures(graph, '');
}

export function graphToPhysicalFeatures(
  graph: Graph,
): GeoJSONFeatureCollection {
  return buildFeatures(graph, PHYSICAL_EDGE_PREFIX);
}

// Converts an erased feature id into physical raw-edge ids. A logical feature
// (a merged chain) expands to one physical id per consecutive vertex pair.
// Physical ids are order-independent, so persisting them makes erase state
// replay identically on reload. Falls back to the original id when the feature
// cannot be resolved (e.g. legend/stale data).
export function featureToPhysicalEdgeIds(
  feature: GeoJSONFeature | undefined,
  featureId: string,
): string[] {
  if (featureId.startsWith(PHYSICAL_EDGE_PREFIX)) return [featureId];

  if (!feature || feature.geometry.type !== 'LineString') return [featureId];

  const coords = feature.geometry.coordinates as [number, number][];
  if (coords.length < 2) return [featureId];

  const ids: string[] = [];
  for (let i = 0; i + 1 < coords.length; i++) {
    const a = pointKey(coords[i][1], coords[i][0]);
    const b = pointKey(coords[i + 1][1], coords[i + 1][0]);
    ids.push(PHYSICAL_EDGE_PREFIX + edgeIdKey(a, b));
  }

  return ids;
}
