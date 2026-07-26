import { useRef, useCallback, useEffect, useState } from 'react';
import { useMap, useMapEvents, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJSONFeatureCollection } from '../hooks/useOverpass';

const THRESHOLD_PX = 20;

function distToSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

interface EraserToolProps {
  active: boolean;
  trails: GeoJSONFeatureCollection | null;
  onEraseStart: () => void;
  onEraseFeature: (featureId: string) => void;
}

function EraserTool({ active, trails, onEraseStart, onEraseFeature }: EraserToolProps) {
  const map = useMap();
  const erasing = useRef(false);
  const [mouseLatlng, setMouseLatlng] = useState<L.LatLng | null>(null);

  useEffect(() => {
    if (active) {
      map.dragging.disable();
    } else {
      erasing.current = false;
      setMouseLatlng(null);
      map.dragging.enable();
    }
  }, [map, active]);

  const radius = mouseLatlng
    ? map.containerPointToLatLng(
        map.latLngToContainerPoint(mouseLatlng).add([THRESHOLD_PX, 0])
      ).distanceTo(mouseLatlng)
    : 10;

  const eraseAt = useCallback(
    (latlng: L.LatLng) => {
      if (!trails) return;
      const pt = map.latLngToContainerPoint(latlng);

      for (const feature of trails.features) {
        if (!feature.id) continue;
        if (feature.geometry.type !== 'LineString') continue;
        const coords = feature.geometry.coordinates as [number, number][];

        for (let i = 0; i < coords.length - 1; i++) {
          const a = map.latLngToContainerPoint(L.latLng(coords[i][1], coords[i][0]));
          const b = map.latLngToContainerPoint(L.latLng(coords[i + 1][1], coords[i + 1][0]));
          if (distToSegment(pt.x, pt.y, a.x, a.y, b.x, b.y) < THRESHOLD_PX) {
            onEraseFeature(feature.id);
            break;
          }
        }
      }
    },
    [map, trails, onEraseFeature]
  );

  useMapEvents({
    mousedown(e: L.LeafletMouseEvent) {
      if (!active) return;
      erasing.current = true;
      map.dragging.disable();
      onEraseStart();
      eraseAt(e.latlng);
    },
    mousemove(e: L.LeafletMouseEvent) {
      if (active) setMouseLatlng(e.latlng);
      if (!active || !erasing.current) return;
      eraseAt(e.latlng);
    },
    mouseup() {
      erasing.current = false;
    },
  });

  if (!active || !mouseLatlng) return null;

  return (
    <CircleMarker
      center={mouseLatlng}
      radius={radius}
      pathOptions={{
        color: '#e05a2a',
        fillColor: '#e05a2a',
        fillOpacity: 0.1,
        weight: 2,
        dashArray: '5 3',
        interactive: false,
      }}
    />
  );
}

export default EraserTool;
