import { useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, useMap, Marker, CircleMarker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import LocateButton from './LocateButton';
import DrawControl, { type Bbox } from './DrawControl';
import TrailLayer from './TrailLayer';
import GraphDebugLayer from './GraphDebugLayer';
import RouteLayer from './RouteLayer';
import type { GeoJSONFeatureCollection } from '../hooks/useOverpass';
import type { Graph } from '../graph/types';

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

function StartPointPicker({
  active,
  graph,
  onSelect,
}: {
  active: boolean;
  graph: Graph | null;
  onSelect: (nodeId: string) => void;
}) {
  useMapEvents({
    click(e: L.LeafletMouseEvent) {
      if (!active || !graph) return;

      let bestId = '';
      let bestDist = Infinity;
      for (const [id, node] of graph.nodes) {
        const dLat = node.lat - e.latlng.lat;
        const dLng = node.lng - e.latlng.lng;
        const dist = dLat * dLat + dLng * dLng;
        if (dist < bestDist) {
          bestDist = dist;
          bestId = id;
        }
      }
      if (bestId) onSelect(bestId);
    },
  });
  return null;
}

interface MapViewProps {
  drawing: boolean;
  bbox: Bbox | null;
  trails: GeoJSONFeatureCollection | null;
  graph: Graph | null;
  logicalGraph: Graph | null;
  showDebug: boolean;
  startNodeId: string | null;
  selectingStart: boolean;
  routeCoords: [number, number][] | null;
  hoverPoint: { lat: number; lng: number } | null;
  onDrawEnd: (bbox: Bbox) => void;
  onFeatureClick: (featureId: string) => void;
  onStartNodeSelected: (nodeId: string) => void;
  center: [number, number];
  zoom: number;
}

function MapView({
  drawing, bbox, trails, graph, logicalGraph, showDebug, startNodeId,
  selectingStart, routeCoords, hoverPoint, onDrawEnd, onFeatureClick, onStartNodeSelected,
  center, zoom,
}: MapViewProps) {
  const cursor = selectingStart ? 'crosshair' : drawing ? 'crosshair' : '';

  const startNode = startNodeId && logicalGraph ? logicalGraph.nodes.get(startNodeId) : null;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ width: '100%', height: '100%', cursor }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <LocateButton />
      <DrawControl drawing={drawing} existingBbox={bbox} onDrawEnd={onDrawEnd} />
      {trails && (
        <TrailLayer trails={trails} onFeatureClick={onFeatureClick} />
      )}
      {routeCoords && <RouteLayer coords={routeCoords} />}
      {graph && (
        <GraphDebugLayer graph={graph} showNodes={showDebug} showEdges={showDebug} />
      )}
      {startNode && (
        <Marker
          position={[startNode.lat, startNode.lng]}
          icon={L.divIcon({
            className: 'start-marker',
            html: '<div style="background:#22c55e;width:14px;height:14px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 6px rgba(0,0,0,0.4)"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          })}
        />
      )}
      {hoverPoint && (
        <CircleMarker
          center={[hoverPoint.lat, hoverPoint.lng]}
          radius={7}
          pathOptions={{
            color: '#fff',
            fillColor: '#3b82f6',
            fillOpacity: 1,
            weight: 3,
          }}
        />
      )}
      <StartPointPicker active={selectingStart} graph={logicalGraph} onSelect={onStartNodeSelected} />
      <MapPersistence />
      <MapViewSync center={center} zoom={zoom} />
    </MapContainer>
  );
}

export default MapView;
