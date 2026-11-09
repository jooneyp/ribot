// OWNER: Joe. Near-home danger layer: streams, reservoirs and hills within the manual's 75% ring.
// Why: deaths "most commonly occurred in unpopulated areas due to exposure and drowning" and were found
// "closer to the place last seen" (Rowe et al., BMC Geriatrics 2011).
import type { GeoResult, Hazard } from "./contracts";

export const HAZARD_RING_KM = 3.2; // Koester, Lost Person Behavior: 75% of urban dementia subjects within 3.2 km (n=336)

const QUERIES: { query: string; kind: Hazard["kind"]; categories: string[] }[] = [
  { query: "하천", kind: "water", categories: ["하천", "계곡"] },
  { query: "저수지", kind: "water", categories: ["저수지", "호수", "댐"] },
  { query: "산", kind: "hill", categories: ["산", "봉우리", "고개"] },
];

type KakaoDoc = { place_name: string; category_name: string; x: string; y: string; distance: string };
const cache = new Map<string, Hazard[]>();

export async function nearbyHazards(center: GeoResult, perKind = 3): Promise<Hazard[]> {
  const key = process.env.KAKAO_REST_KEY;
  if (!key) return [];
  const cacheKey = `${center.lat.toFixed(4)},${center.lng.toFixed(4)}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const found = new Map<string, Hazard>();
  for (const q of QUERIES) {
    const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    url.searchParams.set("query", q.query);
    url.searchParams.set("x", String(center.lng));
    url.searchParams.set("y", String(center.lat));
    url.searchParams.set("radius", String(Math.round(HAZARD_RING_KM * 1000)));
    url.searchParams.set("sort", "distance");
    url.searchParams.set("size", "15");
    try {
      const r = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
      if (!r.ok) continue;
      const docs = ((await r.json()) as { documents?: KakaoDoc[] }).documents ?? [];
      for (const d of docs) {
        const leaf = d.category_name.split(" > ").pop() ?? "";
        if (!q.categories.includes(leaf)) continue;
        const km = Math.round(Number(d.distance) / 100) / 10;
        const prev = found.get(d.place_name);
        if (prev && prev.distance_km <= km) continue;
        found.set(d.place_name, {
          name: d.place_name,
          kind: q.kind,
          geo: { lat: Number(d.y), lng: Number(d.x), display_name: d.place_name, source: "kakao" },
          distance_km: km,
        });
      }
    } catch {
      continue;
    }
  }
  const all = [...found.values()].sort((a, b) => a.distance_km - b.distance_km);
  const result = [
    ...all.filter((h) => h.kind === "water").slice(0, perKind),
    ...all.filter((h) => h.kind === "hill").slice(0, perKind),
  ].sort((a, b) => a.distance_km - b.distance_km);
  cache.set(cacheKey, result);
  return result;
}
