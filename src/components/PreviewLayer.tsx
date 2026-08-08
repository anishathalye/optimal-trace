import { useEffect, useRef, useState, useMemo } from 'react';
import { Polyline, CircleMarker } from 'react-leaflet';
import type { RouteSegment } from '../solver/cpp';
import { haversineDistance } from '../utils/geo';

interface PreviewLayerProps {
  segments: RouteSegment[];
  coords: [number, number][];
  active: boolean;
  onEnd: () => void;
}

const TARGET_SPEED = 300; // m/s

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function PreviewLayer({ segments, coords, active, onEnd }: PreviewLayerProps) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);

  const totalSteps = coords.length - 1;

  const cumulativeDistance = useMemo(() => {
    const dist: number[] = [0];
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
      const [lng1, lat1] = coords[i - 1];
      const [lng2, lat2] = coords[i];
      total += haversineDistance(lat1, lng1, lat2, lng2);
      dist.push(total);
    }
    return dist;
  }, [coords]);

  const totalDistance = cumulativeDistance[cumulativeDistance.length - 1];

  useEffect(() => {
    if (!active || totalSteps < 1) return;

    startTimeRef.current = 0;
    setProgress(0);

    const animate = (time: number) => {
      if (startTimeRef.current === 0) {
        startTimeRef.current = time;
      }

      const elapsed = (time - startTimeRef.current) / 1000;
      const distCovered = elapsed * TARGET_SPEED;

      let newProgress = totalSteps;
      if (distCovered < totalDistance) {
        for (let i = 0; i < cumulativeDistance.length - 1; i++) {
          if (
            cumulativeDistance[i] <= distCovered &&
            distCovered < cumulativeDistance[i + 1]
          ) {
            const segDist = cumulativeDistance[i + 1] - cumulativeDistance[i];
            const fraction =
              segDist > 0 ? (distCovered - cumulativeDistance[i]) / segDist : 0;
            newProgress = i + fraction;
            break;
          }
        }
      }
      setProgress(newProgress);

      if (newProgress < totalSteps) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        onEnd();
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [active, totalSteps, cumulativeDistance, totalDistance, onEnd]);

  const segmentRanges = useMemo(() => {
    const ranges: { start: number; end: number }[] = [];
    let idx = 0;
    for (const seg of segments) {
      const len = seg.coords.length;
      ranges.push({ start: idx, end: idx + len - 1 });
      idx += len - 1;
    }
    return ranges;
  }, [segments]);

  if (!active || totalSteps < 1) return null;

  const coordIndex = Math.floor(progress);
  const fraction = progress - coordIndex;

  const currentLng =
    coordIndex < totalSteps
      ? lerp(coords[coordIndex][0], coords[coordIndex + 1][0], fraction)
      : coords[totalSteps][0];
  const currentLat =
    coordIndex < totalSteps
      ? lerp(coords[coordIndex][1], coords[coordIndex + 1][1], fraction)
      : coords[totalSteps][1];

  const renderedSegments = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const range = segmentRanges[i];

    if (progress >= range.end) {
      renderedSegments.push(
        <Polyline
          key={`preview-${i}`}
          positions={seg.coords.map(
            ([lng, lat]) => [lat, lng] as [number, number],
          )}
          pathOptions={{
            color: seg.retraced ? '#f59e0b' : '#8b5cf6',
            weight: 5,
            opacity: 0.9,
          }}
        />,
      );
    } else if (progress >= range.start) {
      const localProgress = progress - range.start;
      const localIndex = Math.floor(localProgress);
      const localFrac = localProgress - localIndex;
      const count = localIndex + 1;
      const partial = seg.coords.slice(0, count);

      if (localIndex < seg.coords.length - 1 && localFrac > 0) {
        const interpLng = lerp(
          seg.coords[localIndex][0],
          seg.coords[localIndex + 1][0],
          localFrac,
        );
        const interpLat = lerp(
          seg.coords[localIndex][1],
          seg.coords[localIndex + 1][1],
          localFrac,
        );
        partial.push([interpLng, interpLat]);
      }

      if (partial.length >= 2) {
        renderedSegments.push(
          <Polyline
            key={`preview-${i}`}
            positions={partial.map(
              ([lng, lat]) => [lat, lng] as [number, number],
            )}
            pathOptions={{
              color: seg.retraced ? '#f59e0b' : '#8b5cf6',
              weight: 5,
              opacity: 0.9,
            }}
          />,
        );
      }
      break;
    }
  }

  return (
    <>
      {renderedSegments}
      <CircleMarker
        center={[currentLat, currentLng]}
        radius={7}
        pathOptions={{
          color: '#fff',
          fillColor: '#22c55e',
          fillOpacity: 1,
          weight: 3,
        }}
      />
    </>
  );
}

export default PreviewLayer;
