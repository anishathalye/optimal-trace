const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

function buildQuery(bbox: Bbox): string {
  const { south, west, north, east } = bbox;
  return (
    `[out:json][timeout:90];\n` +
    `way["highway"~"^(path|footway|track|bridleway|steps|cycleway)$"]` +
    `(${south},${west},${north},${east});\n` +
    `out geom;`
  );
}

export async function fetchTrails(bbox: Bbox): Promise<Record<string, unknown>> {
  const query = buildQuery(bbox);

  let lastError: Error | null = null;

  for (const url of OVERPASS_URLS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      });

      if (response.ok) {
        return await response.json();
      }

      if (response.status === 429) {
        lastError = new Error('Too many requests. Please wait a moment and try again.');
        continue;
      }

      if (response.status === 504) {
        lastError = new Error('The query timed out. Try selecting a smaller area or try again later.');
        continue;
      }

      lastError = new Error(`Request failed (${response.status}). Please try again.`);
      continue;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Network error. Please check your connection and try again.');
      continue;
    }
  }

  throw lastError ?? new Error('Failed to fetch trails from all available servers.');
}
