import { useCallback } from 'react';
import { GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJSONFeatureCollection, GeoJSONFeature } from '../hooks/useOverpass';

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

function TrailLayer({ trails, onFeatureClick, disableClicks }: TrailLayerProps) {
  const map = useMap();

  const onEachFeature = useCallback(
    (feature: GeoJSONFeature, layer: L.Layer) => {
      const pathLayer = layer as L.Path;

      const handleClick = () => {
        if (disableClicks) return;
        if (feature.id) onFeatureClick(feature.id);
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
    [map, onFeatureClick, disableClicks]
  );

  return (
    <GeoJSON
      key={`${trails.features.length}-${disableClicks}`}
      data={trails}
      pathOptions={TRAIL_STYLE}
      onEachFeature={onEachFeature}
    />
  );
}

export default TrailLayer;
