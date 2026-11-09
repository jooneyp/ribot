// OWNER: lane B (geo-plan). Signature is the contract.
import fs from "node:fs";
import path from "node:path";
import type { GeoResult } from "./contracts";

const cache = new Map<string, GeoResult | null>();
const cachePath = path.join(process.cwd(), "data/local/geocode_cache.json");
let cacheLoaded = false;
let nextNominatimAt = 0;
let nominatimQueue = Promise.resolve();

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const saved = JSON.parse(fs.readFileSync(cachePath, "utf8")) as Record<string, GeoResult | null>;
    for (const [query, result] of Object.entries(saved)) cache.set(query, result);
  } catch {
    // The optional local cache does not need to exist.
  }
}

function saveCache() {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(Object.fromEntries(cache), null, 2));
  } catch {
    // A read-only deployment still has the in-memory cache.
  }
}

async function kakao(query: string, endpoint: "keyword" | "address", key: string): Promise<GeoResult | null> {
  const url = new URL(`https://dapi.kakao.com/v2/local/search/${endpoint}.json`);
  url.searchParams.set("query", query);
  url.searchParams.set("size", "1");
  const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!response.ok) throw new Error(`Kakao geocoding failed (${response.status})`);
  const body = (await response.json()) as {
    documents?: { x: string; y: string; place_name?: string; address_name?: string }[];
  };
  const hit = body.documents?.[0];
  if (!hit) return null;
  return {
    lat: Number(hit.y),
    lng: Number(hit.x),
    display_name: hit.place_name || hit.address_name || query,
    source: "kakao",
  };
}

async function nominatim(query: string): Promise<GeoResult | null> {
  const run = async () => {
    const waitMs = Math.max(0, nextNominatimAt - Date.now());
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    nextNominatimAt = Date.now() + 1_000;
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    const response = await fetch(url, { headers: { "User-Agent": "ribot-hackathon" } });
    if (!response.ok) throw new Error(`Nominatim geocoding failed (${response.status})`);
    const hits = (await response.json()) as { lat: string; lon: string; display_name: string }[];
    const hit = hits[0];
    return hit
      ? { lat: Number(hit.lat), lng: Number(hit.lon), display_name: hit.display_name, source: "nominatim" as const }
      : null;
  };
  const pending = nominatimQueue.then(run, run);
  nominatimQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

/** Kakao Local (address, then keyword) if KAKAO_REST_KEY; else or on miss OSM Nominatim (1 req/s, User-Agent). Cached. null if not found. */
export async function geocode(query: string): Promise<GeoResult | null> {
  const normalized = query.trim();
  if (!normalized) return null;
  loadCache();
  if (cache.has(normalized)) return cache.get(normalized) ?? null;

  const key = process.env.KAKAO_REST_KEY?.trim();
  let result: GeoResult | null = null;
  if (key) {
    // Address search first: region names ("전남 나주", "광주광역시") resolve to their centroid; keyword
    // search returns an arbitrary POI (영산강정원, 순천만국가정원 -> Naju home_to_found 71.2 km instead of 21.8).
    // POI names (수서역) fall through to keyword search. Deliberate deviation from BRIEF task 1 order.
    try {
      result = (await kakao(normalized, "address", key)) ?? (await kakao(normalized, "keyword", key));
    } catch {
      result = null; // Kakao outage or quota: fall back to Nominatim below.
    }
  }
  if (!result) result = await nominatim(normalized);
  cache.set(normalized, result);
  saveCache();
  return result;
}
