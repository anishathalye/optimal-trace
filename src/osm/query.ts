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

const TRAIL_TAGS = [
  'path',
  'footway',
  'track',
  'bridleway',
  'steps',
  'cycleway',
] as const;
const ROAD_TAGS = [
  'residential',
  'unclassified',
  'tertiary',
  'secondary',
  'primary',
  'service',
  'living_street',
  'pedestrian',
] as const;

function areaSelector(bbox: Bbox, polygon?: [number, number][]): string {
  if (polygon && polygon.length >= 3) {
    const points = polygon.map(([lng, lat]) => `${lat} ${lng}`).join(' ');
    return `(poly:"${points}")`;
  }
  return `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
}

function buildQuery(
  bbox: Bbox,
  includeRoads: boolean,
  polygon?: [number, number][],
): string {
  const area = areaSelector(bbox, polygon);

  const tags = includeRoads ? [...TRAIL_TAGS, ...ROAD_TAGS] : [...TRAIL_TAGS];

  const wayBlocks = tags
    .map((tag) => {
      const extra = tag === 'footway' ? '["footway"!="sidewalk"]' : '';
      return `  way["highway"="${tag}"]${extra}${area};`;
    })
    .join('\n');

  return `[out:json][timeout:45];\n(\n${wayBlocks}\n);\nout geom;`;
}

export async function fetchTrails(
  bbox: Bbox,
  includeRoads = false,
  signal?: AbortSignal,
  polygon?: [number, number][],
): Promise<Record<string, unknown>> {
  const query = buildQuery(bbox, includeRoads, polygon);
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
      lastError = new Error(
        'Could not reach the Overpass API. Check your connection or try again later.',
      );
    }
  }

  throw (
    lastError ?? new Error('Failed to fetch trails from all available servers.')
  );
}
