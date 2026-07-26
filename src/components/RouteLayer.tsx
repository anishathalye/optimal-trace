import { Polyline } from 'react-leaflet';
import type { RouteSegment } from '../solver/cpp';

interface RouteLayerProps {
  segments: RouteSegment[];
}

function RouteLayer({ segments }: RouteLayerProps) {
  return (
    <>
      {segments.map((seg, i) => (
        <Polyline
          key={`route-seg-${i}`}
          positions={seg.coords.map(
            ([lng, lat]) => [lat, lng] as [number, number],
          )}
          pathOptions={{
            color: seg.retraced ? '#f59e0b' : '#22c55e',
            weight: 5,
            opacity: 0.9,
          }}
        />
      ))}
    </>
  );
}

export default RouteLayer;
