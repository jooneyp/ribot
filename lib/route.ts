// OWNER: Joe. Street walking routes from last seen to the top places, where she could be by now, and public CCTVs on the way.
import fs from "node:fs";
import path from "node:path";
import type { Cctv, LatLng, Plan, RouteResult, RoutesResult } from "./contracts";
import { haversineKm, round1 } from "./metrics";

export const WALK_KMH = 3; // assumed walking pace for an older adult
const OSRM = "https://routing.openstreetmap.de/routed-foot/route/v1/foot";
const CCTV_NEAR_KM = 0.08;
const routeCache = new Map<string, { coords: [number, number][]; km: number }>();

async function walkRoute(a: LatLng, b: LatLng): Promise<{ coords: [number, number][]; km: number } | null> {
  const key = `${a.lat.toFixed(5)},${a.lng.toFixed(5)}>${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
  const hit = routeCache.get(key);
  if (hit) return hit;
  try {
    const r = await fetch(`${OSRM}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`, {
      headers: { "User-Agent": "ribot-hackathon" },
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { routes?: { distance: number; geometry: { coordinates: [number, number][] } }[] };
    const route = d.routes?.[0];
    if (!route) return null;
    const out = { coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]), km: route.distance / 1000 };
    routeCache.set(key, out);
    return out;
  } catch {
    return null;
  }
}

/** Prefix of a polyline up to `km`, plus the end point. */
export function walkPrefix(coords: [number, number][], km: number): { walked: [number, number][]; point: LatLng } {
  if (coords.length === 0) return { walked: [], point: { lat: 0, lng: 0 } };
  const walked: [number, number][] = [coords[0]];
  let left = km;
  for (let i = 1; i < coords.length; i++) {
    const a = { lat: coords[i - 1][0], lng: coords[i - 1][1] };
    const b = { lat: coords[i][0], lng: coords[i][1] };
    const seg = haversineKm(a, b);
    if (seg >= left) {
      const t = seg === 0 ? 0 : left / seg;
      const p: [number, number] = [a.lat + (b.lat - a.lat) * t, a.lng + (b.lng - a.lng) * t];
      walked.push(p);
      return { walked, point: { lat: p[0], lng: p[1] } };
    }
    left -= seg;
    walked.push(coords[i]);
  }
  const last = coords[coords.length - 1];
  return { walked, point: { lat: last[0], lng: last[1] } };
}

// data/cctv_seoul.json: Seoul rows of 전국CCTV표준데이터 (data.go.kr 15013094), downloaded 2026-11-09.
let cctvAll: Cctv[] | null = null;
function loadCctv(): Cctv[] {
  if (cctvAll) return cctvAll;
  const fp = path.join(process.cwd(), "data/cctv_seoul.json");
  cctvAll = fs.existsSync(fp) ? (JSON.parse(fs.readFileSync(fp, "utf8")) as Cctv[]) : [];
  return cctvAll;
}

function cctvsAlong(walked: [number, number][]): Cctv[] {
  const all = loadCctv();
  if (!all.length || walked.length < 2) return [];
  const lats = walked.map((p) => p[0]); const lngs = walked.map((p) => p[1]);
  const pad = 0.002;
  const box = { s: Math.min(...lats) - pad, n: Math.max(...lats) + pad, w: Math.min(...lngs) - pad, e: Math.max(...lngs) + pad };
  const out: { c: Cctv; idx: number }[] = [];
  for (const c of all) {
    if (c.lat < box.s || c.lat > box.n || c.lng < box.w || c.lng > box.e) continue;
    let best = Infinity; let bestIdx = 0;
    for (let i = 0; i < walked.length; i += 1) {
      const d = haversineKm(c, { lat: walked[i][0], lng: walked[i][1] });
      if (d < best) { best = d; bestIdx = i; }
    }
    if (best <= CCTV_NEAR_KM) out.push({ c, idx: bestIdx });
  }
  return out.sort((a, b) => a.idx - b.idx).map((x) => x.c);
}

/** Up to 3 walking routes: the top places within 15 km, or the first send-first hub when the top place is far. */
export async function buildRoutes(plan: Plan, elapsedHours: number): Promise<RoutesResult> {
  const origin = plan.last_seen.geo;
  // A city-level last seen (e.g. 'Seoul') is a city centre, not a street: walking routes from it would be fiction.
  if (plan.last_seen.label.includes("(city-level)")) return { walk_kmh: WALK_KMH, elapsed_hours: elapsedHours, routes: [] };
  type Target = { id: string; name: string; rank: number; layer: RouteResult["layer"]; geo: LatLng };
  const targets: Target[] = [];
  for (const c of plan.candidates) {
    if (targets.length >= 3) break;
    if (c.distance_km_from_last_seen > 0.3 && c.distance_km_from_last_seen <= 15) {
      targets.push({ id: c.place_id, name: c.name, rank: c.rank, layer: c.layer === "routine" ? "routine" : "past", geo: c.geo });
    }
  }
  const hub = plan.send_first.find((h) => h.geo);
  if (hub?.geo && targets.length < 3) targets.push({ id: `hub-${hub.name}`, name: hub.name, rank: 0, layer: "hub", geo: hub.geo });

  const routes: RouteResult[] = [];
  for (const t of targets) {
    const r = await walkRoute(origin, t.geo);
    if (!r) continue;
    const reachKm = Math.min(r.km, elapsedHours * WALK_KMH);
    const { walked, point } = walkPrefix(r.coords, reachKm);
    routes.push({
      to_place_id: t.id,
      to_name: t.name,
      rank: t.rank,
      layer: t.layer,
      coords: r.coords,
      distance_km: round1(r.km),
      walk_hours: Math.round((r.km / WALK_KMH) * 10) / 10,
      reach: { hours: elapsedHours, km: round1(reachKm), point, walked },
      cctvs: cctvsAlong(walked),
    });
  }
  return { walk_kmh: WALK_KMH, elapsed_hours: elapsedHours, routes };
}
