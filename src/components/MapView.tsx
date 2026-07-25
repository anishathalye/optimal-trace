import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import LocateButton from './LocateButton';
import DrawControl, { type Bbox } from './DrawControl';

delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const DEFAULT_CENTER: L.LatLngExpression = [40.0, -105.0];
const DEFAULT_ZOOM = 11;

interface MapViewProps {
  drawing: boolean;
  bbox: Bbox | null;
  onDrawEnd: (bbox: Bbox) => void;
}

function MapView({ drawing, bbox, onDrawEnd }: MapViewProps) {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ width: '100%', height: '100%', cursor: drawing ? 'crosshair' : '' }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <LocateButton />
      <DrawControl drawing={drawing} existingBbox={bbox} onDrawEnd={onDrawEnd} />
    </MapContainer>
  );
}

export default MapView;
