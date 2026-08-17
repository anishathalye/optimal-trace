import { useCallback, useMemo } from 'react';
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
  onFeatureClick: (featureId: string) => void;
  disableClicks?: boolean;
}

function TrailLayer({
  trails,
  onFeatureClick,
  disableClicks,
}: TrailLayerProps) {
  const map = useMap();

  const onEachFeature = useCallback(
    (feature: { id?: string | number }, layer: L.Layer) => {
      const pathLayer = layer as L.Path;

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

  return (
    <GeoJSON
      key={`${trails.features.length}-${coordinateCount}-${disableClicks}`}
      data={trails}
      pathOptions={TRAIL_STYLE}
      onEachFeature={onEachFeature}
    />
  );
}

export default TrailLayer;
