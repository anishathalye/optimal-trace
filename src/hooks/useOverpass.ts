import { useState, useCallback, useRef } from 'react';
import { fetchTrails, type Bbox } from '../osm/query';
import osmtogeojson from 'osmtogeojson';

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: string;
      coordinates: unknown;
    };
    properties: Record<string, unknown>;
  }>;
}

interface UseOverpassResult {
  trails: GeoJSONFeatureCollection | null;
  loading: boolean;
  error: string | null;
  fetch: (bbox: Bbox, includeRoads: boolean) => void;
  clear: () => void;
}

export function useOverpass(): UseOverpassResult {
  const [trails, setTrails] = useState<GeoJSONFeatureCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchFn = useCallback(async (bbox: Bbox, includeRoads: boolean) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const raw = await fetchTrails(bbox, includeRoads, controller.signal);
      const geojson = osmtogeojson(raw) as unknown as GeoJSONFeatureCollection;
      setTrails(geojson);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to fetch trails.');
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setTrails(null);
    setError(null);
    setLoading(false);
  }, []);

  return { trails, loading, error, fetch: fetchFn, clear };
}
