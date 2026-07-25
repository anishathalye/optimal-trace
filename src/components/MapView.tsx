import { useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import LocateButton from './LocateButton';
import DrawControl, { type Bbox } from './DrawControl';
import TrailLayer from './TrailLayer';
import type { GeoJSONFeatureCollection } from '../hooks/useOverpass';

delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const VIEW_KEY = 'trail-trace-view';

function MapPersistence() {
  const map = useMap();
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  const saveView = useCallback(() => {
    const c = map.getCenter();
    const z = map.getZoom();
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({ lat: c.lat, lng: c.lng, zoom: z }));
    } catch { /* storage full */ }
  }, [map]);

  useEffect(() => {
    const onMoveEnd = () => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(saveView, 300);
    };
    map.on('moveend', onMoveEnd);
    return () => {
      map.off('moveend', onMoveEnd);
      clearTimeout(saveTimer.current);
    };
  }, [map, saveView]);

  return null;
}

function MapViewSync({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);

  return null;
}

interface MapViewProps {
  drawing: boolean;
  bbox: Bbox | null;
  trails: GeoJSONFeatureCollection | null;
  onDrawEnd: (bbox: Bbox) => void;
  onFeatureClick: (featureId: string) => void;
  center: [number, number];
  zoom: number;
}

function MapView({ drawing, bbox, trails, onDrawEnd, onFeatureClick, center, zoom }: MapViewProps) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ width: '100%', height: '100%', cursor: drawing ? 'crosshair' : '' }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <LocateButton />
      <DrawControl drawing={drawing} existingBbox={bbox} onDrawEnd={onDrawEnd} />
      {trails && (
        <TrailLayer
          trails={trails}
          onFeatureClick={onFeatureClick}
        />
      )}
      <MapPersistence />
      <MapViewSync center={center} zoom={zoom} />
    </MapContainer>
  );
}

export default MapView;
