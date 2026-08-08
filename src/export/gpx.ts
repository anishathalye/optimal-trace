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
