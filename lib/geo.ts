// OWNER: lane B (geo-plan). Signature is the contract.
import type { GeoResult } from "./contracts";

/** Kakao Local if KAKAO_REST_KEY, else OSM Nominatim (1 req/s, User-Agent). Cached. null if not found. */
export async function geocode(_query: string): Promise<GeoResult | null> {
  return null;
}
