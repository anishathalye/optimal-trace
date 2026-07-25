import { GeoJSON } from 'react-leaflet';
import type { GeoJSONFeatureCollection } from '../hooks/useOverpass';

const TRAIL_STYLE = {
  color: '#e05a2a',
  weight: 3,
  opacity: 0.9,
};

interface TrailLayerProps {
  trails: GeoJSONFeatureCollection;
}

function TrailLayer({ trails }: TrailLayerProps) {
  return (
    <GeoJSON
      data={trails}
      pathOptions={TRAIL_STYLE}
    />
  );
}

export default TrailLayer;
