import { useCallback, useEffect, useMemo, useRef } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJSONFeatureCollection } from '../hooks/useOverpass';

const TRAIL_STYLE: L.PathOptions = {
  color: '#e05a2a',
  weight: 3,
  opacity: 0.9,
};

const HOVER_STYLE: L.PathOptions = {
  color: '#ff4444',
  weight: 4,
  opacity: 1.0,
};

interface TrailLayerProps {
  trails: GeoJSONFeatureCollection;
  hiddenIds?: ReadonlySet<string>;
  onFeatureClick: (featureId: string) => void;
  disableClicks?: boolean;
}

function TrailLayer({
  trails,
  hiddenIds,
  onFeatureClick,
  disableClicks,
}: TrailLayerProps) {
  const map = useMap();
  const layersRef = useRef<Map<string, L.Path>>(new Map());
  const keyRef = useRef('');

  const onEachFeature = useCallback(
    (feature: { id?: string | number }, layer: L.Layer) => {
      const pathLayer = layer as L.Path;

      if (feature.id != null) {
        layersRef.current.set(String(feature.id), pathLayer);
      }

      const handleClick = () => {
        if (disableClicks) return;
        if (feature.id) onFeatureClick(feature.id as string);
      };

      pathLayer.on({
        click: handleClick,
        mouseover: () => {
          if (disableClicks) return;
          map.getContainer().style.cursor = 'pointer';
          pathLayer.setStyle(HOVER_STYLE);
          pathLayer.bringToFront();
        },
        mouseout: () => {
          if (disableClicks) return;
          map.getContainer().style.cursor = '';
          pathLayer.setStyle(TRAIL_STYLE);
        },
      });
    },
    [map, onFeatureClick, disableClicks],
  );

  const coordinateCount = useMemo(
    () =>
      trails.features.reduce((total, feature) => {
        if (feature.geometry.type !== 'LineString') return total;
        return (
          total + (feature.geometry.coordinates as [number, number][]).length
        );
      }, 0),
    [trails],
  );

  const geoKey = `${trails.features.length}-${coordinateCount}-${disableClicks}`;

  // The GeoJSON layer is recreated whenever geoKey changes, so forget the
  // previous feature→layer map before the new layers are added.
  if (keyRef.current !== geoKey) {
    keyRef.current = geoKey;
    layersRef.current = new Map();
  }

  // Hide features erased during the current gesture without rebuilding the
  // graph, so dragging erases live.
  useEffect(() => {
    if (!hiddenIds || hiddenIds.size === 0) return;
    for (const id of hiddenIds) {
      const layer = layersRef.current.get(id);
      if (layer) {
        layer.remove();
        layersRef.current.delete(id);
      }
    }
  }, [hiddenIds]);

  return (
    <GeoJSON
      key={geoKey}
      data={trails}
      pathOptions={TRAIL_STYLE}
      onEachFeature={onEachFeature}
    />
  );
}

export default TrailLayer;
