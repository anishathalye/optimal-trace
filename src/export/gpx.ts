import { haversineDistance } from '../utils/geo';

export const METERS_PER_MILE = 1609.344;

export function generateGPX(
  coords: [number, number][],
  name: string,
  elevations?: number[],
): string {
  const trackPoints = coords
    .map(([lng, lat], i) => {
      const latStr = lat.toFixed(7);
      const lngStr = lng.toFixed(7);
      if (elevations && i < elevations.length) {
        return `      <trkpt lat="${latStr}" lon="${lngStr}">\n        <ele>${elevations[i].toFixed(1)}</ele>\n      </trkpt>`;
      }
      return `      <trkpt lat="${latStr}" lon="${lngStr}"></trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Optimal Trace" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <type>running</type>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function splitRouteIndices(
  coords: [number, number][],
  maxDistanceMeters: number,
): Array<[number, number]> {
  const n = coords.length;
  if (n === 0) return [];
  if (n === 1 || maxDistanceMeters <= 0) return [[0, n - 1]];

  const cumulative: number[] = new Array(n);
  cumulative[0] = 0;
  for (let i = 1; i < n; i++) {
    cumulative[i] =
      cumulative[i - 1] +
      haversineDistance(
        coords[i - 1][1],
        coords[i - 1][0],
        coords[i][1],
        coords[i][0],
      );
  }

  if (cumulative[n - 1] <= maxDistanceMeters) return [[0, n - 1]];

  const ranges: Array<[number, number]> = [];
  let start = 0;
  while (start < n - 1) {
    let end = start;
    while (
      end + 1 < n &&
      cumulative[end + 1] - cumulative[start] <= maxDistanceMeters
    ) {
      end++;
    }
    if (end === start) end = start + 1;
    ranges.push([start, end]);
    if (end === n - 1) break;
    start = end;
  }
  return ranges;
}

export function generateSplitGPX(
  coords: [number, number][],
  name: string,
  maxDistanceMiles: number,
  elevations?: number[],
): string[] {
  const ranges = splitRouteIndices(coords, maxDistanceMiles * METERS_PER_MILE);
  const count = ranges.length;
  return ranges.map(([start, end], i) => {
    const segmentCoords = coords.slice(start, end + 1);
    const segmentElevations = elevations
      ? elevations.slice(start, end + 1)
      : undefined;
    const segmentName = count > 1 ? `${name} (${i + 1} of ${count})` : name;
    return generateGPX(segmentCoords, segmentName, segmentElevations);
  });
}

export function downloadGPXFiles(gpxs: string[], baseFilename: string) {
  const base = baseFilename.replace(/\.gpx$/i, '');
  gpxs.forEach((gpx, i) => {
    const filename =
      gpxs.length > 1
        ? `${base}-${i + 1}-of-${gpxs.length}.gpx`
        : `${base}.gpx`;
    setTimeout(() => downloadGPX(gpx, filename), i * 300);
  });
}

export function downloadGPX(gpx: string, filename: string) {
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
