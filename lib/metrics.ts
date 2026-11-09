// FROZEN (Joe). Pure functions whose output appears on screen.
import type { LatLng } from "./contracts";

const R_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function insideCircle(center: LatLng, radiusKm: number, p: LatLng): boolean {
  return haversineKm(center, p) <= radiusKm;
}

export function circleRadiusKm(elapsedHours: number, speedKmh = 3, capKm = 5): number {
  return Math.min(capKm, Math.max(0, elapsedHours) * speedKmh);
}

/** Distances from found point to each candidate, plus the rank of the nearest one. */
export function revealDistances(
  found: LatLng,
  candidates: { rank: number; name: string; geo: LatLng }[],
): { rows: { rank: number; name: string; distance_to_found_km: number }[]; nearest_rank: number | null } {
  const rows = candidates.map((c) => ({ rank: c.rank, name: c.name, distance_to_found_km: round1(haversineKm(found, c.geo)) }));
  if (rows.length === 0) return { rows, nearest_rank: null };
  const nearest = rows.reduce((m, r) => (r.distance_to_found_km < m.distance_to_found_km ? r : m), rows[0]);
  return { rows, nearest_rank: nearest.rank };
}

export const round1 = (x: number) => Math.round(x * 10) / 10;
