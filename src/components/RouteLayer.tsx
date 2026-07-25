import { Polyline } from 'react-leaflet';

interface RouteLayerProps {
  coords: [number, number][];
}

function RouteLayer({ coords }: RouteLayerProps) {
  const positions = coords.map(([lng, lat]) => [lat, lng] as [number, number]);

  return (
    <Polyline
      positions={positions}
      pathOptions={{
        color: '#22c55e',
        weight: 5,
        opacity: 0.9,
      }}
    />
  );
}

export default RouteLayer;
