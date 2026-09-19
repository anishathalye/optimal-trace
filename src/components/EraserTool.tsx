import { useRef, useCallback, useEffect, useState } from 'react';
import { useMap, useMapEvents, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJSONFeatureCollection } from '../hooks/useOverpass';

const THRESHOLD_PX = 20;

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

interface ProjectedFeature {
  id: string;
  points: L.Point[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface EraserToolProps {
  active: boolean;
  trails: GeoJSONFeatureCollection | null;
  onEraseStart: () => void;
  onEraseFeature: (featureId: string) => void;
  onEraseEnd: () => void;
}

function EraserTool({
  active,
  trails,
  onEraseStart,
  onEraseFeature,
  onEraseEnd,
}: EraserToolProps) {
  const map = useMap();
  const erasing = useRef(false);
  const [mouseLatlng, setMouseLatlng] = useState<L.LatLng | null>(null);
  const projectedRef = useRef<ProjectedFeature[]>([]);
  const erasedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (active) {
      map.dragging.disable();
    } else {
      if (erasing.current) {
        erasing.current = false;
        onEraseEnd();
      }
      setMouseLatlng(null);
      map.dragging.enable();
    }
  }, [map, active, onEraseEnd]);

  // mouseup outside the map never reaches the map handler; listen on the
  // window so erasing does not stay stuck "on" after releasing elsewhere.
  useEffect(() => {
    if (!active) return;
    const stop = () => {
      if (!erasing.current) return;
      erasing.current = false;
      onEraseEnd();
    };
    window.addEventListener('mouseup', stop);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('blur', stop);
    };
  }, [active, onEraseEnd]);

  // Dragging is disabled while erasing, so the map cannot move mid-gesture:
  // screen-space projections are stable and can be computed once, instead of
  // re-projecting every coordinate on every mousemove.
  const buildProjection = useCallback(() => {
    if (!trails) {
      projectedRef.current = [];
      return;
    }

    const list: ProjectedFeature[] = [];
    for (const feature of trails.features) {
      if (!feature.id) continue;
      if (feature.geometry.type !== 'LineString') continue;
      const coords = feature.geometry.coordinates as [number, number][];
      if (coords.length < 2) continue;

      const points: L.Point[] = new Array(coords.length);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < coords.length; i++) {
        const p = map.latLngToContainerPoint(
          L.latLng(coords[i][1], coords[i][0]),
        );
        points[i] = p;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      list.push({ id: feature.id as string, points, minX, minY, maxX, maxY });
    }
    projectedRef.current = list;
  }, [map, trails]);

  useEffect(() => {
    if (!active) {
      projectedRef.current = [];
      return;
    }
    buildProjection();
  }, [active, buildProjection]);

  const eraseAt = useCallback(
    (latlng: L.LatLng) => {
      const list = projectedRef.current;
      if (list.length === 0) return;
      const pt = map.latLngToContainerPoint(latlng);

      for (const feature of list) {
        if (erasedRef.current.has(feature.id)) continue;

        // Cheap bounding-box reject before the per-segment distance tests.
        if (
          pt.x < feature.minX - THRESHOLD_PX ||
          pt.x > feature.maxX + THRESHOLD_PX ||
          pt.y < feature.minY - THRESHOLD_PX ||
          pt.y > feature.maxY + THRESHOLD_PX
        ) {
          continue;
        }

        const points = feature.points;
        for (let i = 0; i < points.length - 1; i++) {
          if (
            distToSegment(
              pt.x,
              pt.y,
              points[i].x,
              points[i].y,
              points[i + 1].x,
              points[i + 1].y,
            ) < THRESHOLD_PX
          ) {
            erasedRef.current.add(feature.id);
            onEraseFeature(feature.id);
            break;
          }
        }
      }
    },
    [map, onEraseFeature],
  );

  useMapEvents({
    mousedown(e: L.LeafletMouseEvent) {
      if (!active) return;
      erasing.current = true;
      map.dragging.disable();
      erasedRef.current = new Set();
      buildProjection();
      onEraseStart();
      eraseAt(e.latlng);
    },
    mousemove(e: L.LeafletMouseEvent) {
      if (active) setMouseLatlng(e.latlng);
      if (!active || !erasing.current) return;
      eraseAt(e.latlng);
    },
  });

  if (!active || !mouseLatlng) return null;

  return (
    <CircleMarker
      center={mouseLatlng}
      radius={THRESHOLD_PX}
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
