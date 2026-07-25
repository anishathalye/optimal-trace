import { useState, useRef, useEffect } from 'react';
import { Rectangle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

interface DrawControlProps {
  drawing: boolean;
  existingBbox: Bbox | null;
  onDrawEnd: (bbox: Bbox) => void;
}

function DrawControl({ drawing, existingBbox, onDrawEnd }: DrawControlProps) {
  const map = useMap();
  const [draftBounds, setDraftBounds] = useState<L.LatLngBounds | null>(null);
  const startRef = useRef<L.LatLng | null>(null);

  useEffect(() => {
    if (drawing) {
      map.dragging.disable();
    } else {
      map.dragging.enable();
    }
  }, [map, drawing]);

  useMapEvents({
    mousedown(e: L.LeafletMouseEvent) {
      if (!drawing) return;
      startRef.current = e.latlng;
      setDraftBounds(null);
    },
    mousemove(e: L.LeafletMouseEvent) {
      const start = startRef.current;
      if (!drawing || !start) return;
      setDraftBounds(L.latLngBounds(start, e.latlng));
    },
    mouseup(e: L.LeafletMouseEvent) {
      const start = startRef.current;
      if (!drawing || !start) return;
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
  });

  const existingBounds = existingBbox
    ? L.latLngBounds([existingBbox.south, existingBbox.west], [existingBbox.north, existingBbox.east])
    : null;

  return (
    <>
      {existingBounds && (
        <Rectangle
          bounds={existingBounds}
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
    </>
  );
}

export default DrawControl;
