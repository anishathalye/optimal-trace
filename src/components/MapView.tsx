import { useEffect, useCallback, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  useMap,
  Marker,
  CircleMarker,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import LocateButton from './LocateButton';
import DrawControl, { type Bbox, type DrawMode } from './DrawControl';
import TrailLayer from './TrailLayer';
import GraphDebugLayer from './GraphDebugLayer';
import EraserTool from './EraserTool';
import RouteLayer from './RouteLayer';
import PreviewLayer from './PreviewLayer';
import type { RouteSegment } from '../solver/cpp';
import type { GeoJSONFeatureCollection } from '../hooks/useOverpass';
import type { Graph } from '../graph/types';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)
  ._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const VIEW_KEY = 'optimal-trace-view';

function MapPersistence() {
  const map = useMap();
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const saveView = useCallback(() => {
    const c = map.getCenter();
    const z = map.getZoom();
    try {
      localStorage.setItem(
        VIEW_KEY,
        JSON.stringify({ lat: c.lat, lng: c.lng, zoom: z }),
      );
    } catch {
      /* storage full */
    }
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

function MapViewSync({
  center,
  zoom,
}: {
  center: [number, number];
  zoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
}

function StartPointPicker({
  active,
  trails,
  onSelect,
}: {
  active: boolean;
  trails: GeoJSONFeatureCollection | null;
  onSelect: (lat: number, lng: number) => void;
}) {
  const [preview, setPreview] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  useMapEvents({
    mousemove(e: L.LeafletMouseEvent) {
      if (!active || !trails) {
        if (preview) setPreview(null);
        return;
      }

      let bestLat = 0;
      let bestLng = 0;
      let bestDist = Infinity;

      for (const feature of trails.features) {
        if (feature.geometry.type !== 'LineString') continue;
        const coords = feature.geometry.coordinates as [number, number][];
        for (const [lng, lat] of coords) {
          const dLat = lat - e.latlng.lat;
          const dLng = lng - e.latlng.lng;
          const dist = dLat * dLat + dLng * dLng;
          if (dist < bestDist) {
            bestDist = dist;
            bestLat = lat;
            bestLng = lng;
          }
        }
      }
      if (bestDist < Infinity) {
        setPreview({ lat: bestLat, lng: bestLng });
      }
    },
    click(e: L.LeafletMouseEvent) {
      if (!active || !trails) return;

      let bestLat = 0;
      let bestLng = 0;
      let bestDist = Infinity;

      for (const feature of trails.features) {
        if (feature.geometry.type !== 'LineString') continue;
        const coords = feature.geometry.coordinates as [number, number][];
        for (const [lng, lat] of coords) {
          const dLat = lat - e.latlng.lat;
          const dLng = lng - e.latlng.lng;
          const dist = dLat * dLat + dLng * dLng;
          if (dist < bestDist) {
            bestDist = dist;
            bestLat = lat;
            bestLng = lng;
          }
        }
      }
      if (bestDist < Infinity) onSelect(bestLat, bestLng);
    },
  });

  useEffect(() => {
    if (!active) setPreview(null);
  }, [active]);

  return preview ? (
    <Marker
      position={[preview.lat, preview.lng]}
      icon={L.divIcon({
        className: '',
        html: '<div style="background:rgba(34,197,94,0.45);width:14px;height:14px;border-radius:50%;border:3px solid rgba(255,255,255,0.6);box-shadow:0 0 6px rgba(0,0,0,0.3)"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })}
    />
  ) : null;
}

interface MapViewProps {
  drawing: boolean;
  drawMode: DrawMode;
  bbox: Bbox | null;
  trails: GeoJSONFeatureCollection | null;
  graph: Graph | null;
  logicalGraph: Graph | null;
  showDebug: boolean;
  startNodeId: string | null;
  selectingStart: boolean;
  erasing: boolean;
  routeSegments: RouteSegment[] | null;
  routeCoords: [number, number][] | null;
  previewing: boolean;
  onPreviewEnd: () => void;
  hoverPoint: { lat: number; lng: number } | null;
  polygonCoords: [number, number][] | null;
  onDrawEnd: (bbox: Bbox, polygonCoords?: [number, number][]) => void;
  onFeatureClick: (featureId: string) => void;
  onStartNodeSelected: (lat: number, lng: number) => void;
  onEraseFeature: (featureId: string) => void;
  onEraseStart: () => void;
  center: [number, number];
  zoom: number;
}

function MapView({
  drawing,
  drawMode,
  bbox,
  polygonCoords,
  trails,
  graph,
  logicalGraph,
  showDebug,
  startNodeId,
  selectingStart,
  erasing,
  routeSegments,
  routeCoords,
  previewing,
  onPreviewEnd,
  hoverPoint,
  onDrawEnd,
  onFeatureClick,
  onStartNodeSelected,
  onEraseStart,
  onEraseFeature,
  center,
  zoom,
}: MapViewProps) {
  const cursor = selectingStart ? 'crosshair' : drawing ? 'crosshair' : '';

  const startNode =
    startNodeId && logicalGraph ? logicalGraph.nodes.get(startNodeId) : null;

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      maxZoom={21}
      style={{ width: '100%', height: '100%', cursor }}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={21}
        maxNativeZoom={19}
      />
      <LocateButton />
      <DrawControl
        drawing={drawing}
        drawMode={drawMode}
        existingBbox={bbox}
        polygonCoords={polygonCoords}
        onDrawEnd={onDrawEnd}
      />
      {trails && (
        <TrailLayer
          trails={trails}
          onFeatureClick={onFeatureClick}
          disableClicks={selectingStart || erasing}
        />
      )}
      {trails && (
        <EraserTool
          active={erasing}
          trails={trails}
          onEraseStart={onEraseStart}
          onEraseFeature={onEraseFeature}
        />
      )}
      {routeSegments && !previewing && <RouteLayer segments={routeSegments} />}
      {routeSegments && routeCoords && (
        <PreviewLayer
          segments={routeSegments}
          coords={routeCoords}
          active={previewing}
          onEnd={onPreviewEnd}
        />
      )}
      {graph && (
        <GraphDebugLayer
          graph={graph}
          showNodes={showDebug}
          showEdges={showDebug}
        />
      )}
      {startNode && !selectingStart && (
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
      <StartPointPicker
        active={selectingStart}
        trails={trails}
        onSelect={onStartNodeSelected}
      />
      <MapPersistence />
      <MapViewSync center={center} zoom={zoom} />
    </MapContainer>
  );
}

export default MapView;
