import type { Graph } from './types';
import { PHYSICAL_EDGE_PREFIX, edgeIdKey } from './types';
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
