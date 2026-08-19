import { useEffect, useState } from 'react';
import { useMap, useMapEvents, CircleMarker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import type { Graph } from '../graph/types';

interface AddTrailToolProps {
  active: boolean;
  graph: Graph | null;
  onAdd: (fromKey: string, toKey: string) => void;
}

interface SnapNode {
  key: string;
  lat: number;
  lng: number;
}

function nearestNode(graph: Graph, latlng: L.LatLng): SnapNode | null {
  let best: SnapNode | null = null;
  let bestDist = Infinity;

  for (const [key, node] of graph.nodes) {
    const dLat = node.lat - latlng.lat;
    const dLng = node.lng - latlng.lng;
    const dist = dLat * dLat + dLng * dLng;
    if (dist < bestDist) {
      bestDist = dist;
      best = { key, lat: node.lat, lng: node.lng };
    }
  }

  return best;
}

function AddTrailTool({ active, graph, onAdd }: AddTrailToolProps) {
  const map = useMap();
  const [start, setStart] = useState<SnapNode | null>(null);
  const [preview, setPreview] = useState<SnapNode | null>(null);

  useEffect(() => {
    if (active) {
      map.dragging.disable();
    } else {
      setStart(null);
      setPreview(null);
      map.dragging.enable();
    }
  }, [map, active]);

  useMapEvents({
    mousemove(e: L.LeafletMouseEvent) {
      if (!active || !graph) {
        if (preview) setPreview(null);
        return;
      }
      setPreview(nearestNode(graph, e.latlng));
    },
    click(e: L.LeafletMouseEvent) {
      if (!active || !graph) return;
      const node = nearestNode(graph, e.latlng);
      if (!node) return;

      if (!start) {
        setStart(node);
        return;
      }

      if (node.key === start.key) {
        setStart(null);
        return;
      }

      onAdd(start.key, node.key);
      setStart(null);
    },
  });

  return (
    <>
      {active && preview && (
        <CircleMarker
          center={[preview.lat, preview.lng]}
          radius={6}
          pathOptions={{
            color: '#16a34a',
            fillColor: start ? '#16a34a' : '#ffffff',
            fillOpacity: 1,
            weight: 2,
            interactive: false,
          }}
        />
      )}
      {active && start && (
        <CircleMarker
          center={[start.lat, start.lng]}
          radius={6}
          pathOptions={{
            color: '#16a34a',
            fillColor: '#16a34a',
            fillOpacity: 1,
            weight: 2,
            interactive: false,
          }}
        />
      )}
      {active && start && preview && preview.key !== start.key && (
        <Polyline
          positions={[
            [start.lat, start.lng],
            [preview.lat, preview.lng],
          ]}
          pathOptions={{
            color: '#16a34a',
            weight: 3,
            dashArray: '6 4',
            opacity: 0.9,
            interactive: false,
          }}
        />
      )}
    </>
  );
}

export default AddTrailTool;
