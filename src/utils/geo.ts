export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface TrailFeature {
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

function featureLength(feature: TrailFeature): number {
  if (feature.geometry.type !== 'LineString') return 0;
  const coords = feature.geometry.coordinates as [number, number][];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineDistance(
      coords[i - 1][1],
      coords[i - 1][0],
      coords[i][1],
      coords[i][0],
    );
  }
  return total;
}

export function trailDistance(trails: { features: TrailFeature[] }): number {
  let total = 0;
  for (const feature of trails.features) {
    total += featureLength(feature);
  }
  return total;
}

export function trailCount(trails: { features: TrailFeature[] }): number {
  return trails.features.filter((f) => f.geometry.type === 'LineString').length;
}

export function filterByMinLength<T extends TrailFeature>(
  features: T[],
  minLength: number,
): T[] {
  if (minLength <= 0) return features;
  return features.filter((f) => featureLength(f) >= minLength);
}
