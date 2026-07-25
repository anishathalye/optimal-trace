const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
];

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

function buildQuery(bbox: Bbox, includeRoads: boolean): string {
  const { south, west, north, east } = bbox;
  const bboxStr = `(${south},${west},${north},${east})`;

  const trailValues = 'path|footway|track|bridleway|steps|cycleway';
  const roadValues = 'residential|unclassified|tertiary|service|living_street|pedestrian';

  const values = includeRoads ? `${trailValues}|${roadValues}` : trailValues;

  return (
    `[out:json][timeout:90];\n` +
    `way["highway"~"^(${values})$"]${bboxStr};\n` +
    `out geom;`
  );
}

export async function fetchTrails(
  bbox: Bbox,
  includeRoads = false,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const query = buildQuery(bbox, includeRoads);
  const encoded = encodeURIComponent(query);

  let lastError: Error | null = null;

  for (const url of OVERPASS_URLS) {
    try {
      const response = await fetch(`${url}?data=${encoded}`, {
        signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          lastError = new Error('Too many requests. Please wait a moment.');
          continue;
        }
        if (response.status === 504) {
          lastError = new Error('Server timed out. Try a smaller area.');
          continue;
        }
        lastError = new Error(`Server error (${response.status}).`);
        continue;
      }

      return await response.json();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      lastError = new Error('Could not reach the Overpass API. Check your connection or try again later.');
    }
  }

  throw lastError ?? new Error('Failed to fetch trails from all available servers.');
}
