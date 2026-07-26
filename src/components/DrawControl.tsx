import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Rectangle,
  Polygon,
  Polyline,
  CircleMarker,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export type DrawMode = 'rectangle' | 'polygon';

interface DrawControlProps {
  drawing: boolean;
  drawMode: DrawMode;
  existingBbox: Bbox | null;
  polygonCoords: [number, number][] | null;
  onDrawEnd: (bbox: Bbox, polygonCoords?: [number, number][]) => void;
}

function DrawControl({
  drawing,
  drawMode,
  existingBbox,
  polygonCoords,
  onDrawEnd,
}: DrawControlProps) {
  const map = useMap();
  const [draftBounds, setDraftBounds] = useState<L.LatLngBounds | null>(null);
  const [polyVertices, setPolyVertices] = useState<L.LatLng[]>([]);
  const [mouseLatlng, setMouseLatlng] = useState<L.LatLng | null>(null);
  const startRef = useRef<L.LatLng | null>(null);

  useEffect(() => {
    if (drawing) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
      setPolyVertices([]);
      setMouseLatlng(null);
    }
  }, [map, drawing]);

  useEffect(() => {
    setPolyVertices([]);
    setDraftBounds(null);
    setMouseLatlng(null);
  }, [drawMode, drawing]);

  const closePolygon = useCallback(
    (vertices: L.LatLng[]) => {
      const coords = vertices.map((v): [number, number] => [v.lng, v.lat]);
      const bounds = L.latLngBounds(vertices);
      onDrawEnd(
        {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        },
        coords,
      );
      setPolyVertices([]);
    },
    [onDrawEnd],
  );

  useMapEvents({
    mousedown(e: L.LeafletMouseEvent) {
      if (!drawing) return;

      if (drawMode === 'rectangle') {
        startRef.current = e.latlng;
        setDraftBounds(null);
        return;
      }

      const first = polyVertices[0];
      if (first && e.latlng.distanceTo(first) < 20) {
        if (polyVertices.length >= 3) {
          closePolygon(polyVertices);
        }
        return;
      }

      setPolyVertices((prev) => [...prev, e.latlng]);
    },
    mousemove(e: L.LeafletMouseEvent) {
      if (!drawing) return;

      if (drawMode === 'rectangle') {
        const start = startRef.current;
        if (!start) return;
        setDraftBounds(L.latLngBounds(start, e.latlng));
        return;
      }

      setMouseLatlng(e.latlng);
    },
    mouseup(e: L.LeafletMouseEvent) {
      if (!drawing || drawMode !== 'rectangle') return;
      const start = startRef.current;
      if (!start) return;
      startRef.current = null;
      setDraftBounds(null);

      const bounds = L.latLngBounds(start, e.latlng);
      if (bounds.isValid()) {
        onDrawEnd({
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast(),
        });
      }
    },
    dblclick() {
      if (!drawing || drawMode !== 'polygon') return;
      if (polyVertices.length >= 3) {
        closePolygon(polyVertices);
      }
    },
  });

  const existingBounds = existingBbox
    ? L.latLngBounds(
        [existingBbox.south, existingBbox.west],
        [existingBbox.north, existingBbox.east],
      )
    : null;

  const previewPoly =
    polyVertices.length > 0 && mouseLatlng
      ? [...polyVertices, mouseLatlng]
      : polyVertices;

  return (
    <>
      {existingBounds && !polygonCoords && (
        <Rectangle
          bounds={existingBounds}
          pathOptions={{
            color: '#4a6fa5',
            weight: 2,
            fillOpacity: 0.15,
          }}
        />
      )}
      {polygonCoords && (
        <Polygon
          positions={polygonCoords.map(
            ([lng, lat]) => [lat, lng] as [number, number],
          )}
          pathOptions={{
            color: '#4a6fa5',
            weight: 2,
            fillOpacity: 0.15,
          }}
        />
      )}
      {draftBounds && (
        <Rectangle
          bounds={draftBounds}
          pathOptions={{
            color: '#4a6fa5',
            weight: 2,
            fillOpacity: 0.15,
            dashArray: '6 4',
          }}
        />
      )}
      {polyVertices.length > 0 && (
        <Polygon
          positions={previewPoly.map(
            (ll) => [ll.lat, ll.lng] as [number, number],
          )}
          pathOptions={{
            color: '#4a6fa5',
            weight: 2,
            fillOpacity: 0.15,
            dashArray: '6 4',
          }}
        />
      )}
      {drawMode === 'polygon' &&
        drawing &&
        polyVertices.map((v, i) => (
          <CircleMarker
            key={i}
            center={[v.lat, v.lng]}
            radius={i === 0 ? 5 : 3}
            pathOptions={{
              color: '#4a6fa5',
              fillColor: i === 0 ? '#fff' : '#4a6fa5',
              fillOpacity: 1,
              weight: 2,
            }}
          />
        ))}
      {drawMode === 'polygon' &&
        drawing &&
        mouseLatlng &&
        polyVertices.length > 0 && (
          <Polyline
            positions={[
              [
                polyVertices[polyVertices.length - 1].lat,
                polyVertices[polyVertices.length - 1].lng,
              ],
              [mouseLatlng.lat, mouseLatlng.lng],
            ]}
            pathOptions={{
              color: '#4a6fa5',
              weight: 1.5,
              dashArray: '4 3',
              opacity: 0.6,
            }}
          />
        )}
    </>
  );
}

export default DrawControl;
