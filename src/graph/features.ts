import type { Graph } from './types';
import type {
  GeoJSONFeatureCollection,
  GeoJSONFeature,
} from '../hooks/useOverpass';

export function graphToFeatures(graph: Graph): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = graph.edges.map((edge) => {
    const a = edge.from;
    const b = edge.to;
    const id = a < b ? `${a}|${b}` : `${b}|${a}`;
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
