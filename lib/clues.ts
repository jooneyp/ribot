// OWNER: Joe. Phone-call clues: her fragments → co-located places inside the tower radius.
// Real case (Hankyoreh 2019-05-29): tower tracking gave a 1 km radius; on the phone she said "공원 같다. 놀이터, 학교 근처";
// she was found at a small playground in a residential area.
import type { CluesInput, CluesResult, ClueSpot } from "./contracts";
import { geocode } from "./geo";
import { extractLandmarks } from "./llm";
import { haversineKm, round1 } from "./metrics";

const NEAR_KM = 0.3;
const PINPOINT = ["놀이터", "다리", "교회", "정류장", "시장", "역", "학교", "하천", "공원", "아파트"];
type KakaoDoc = { place_name: string; category_name: string; x: string; y: string; distance: string };
// Facilities inside a park/school are not places a person "is at"; drop them.
const FACILITY = /화장실|음수대|주차장|출입구|입구|매점|관리사무소|행정실|교무실|편의점|GS25|CU |세븐일레븐|이마트24/;
// Shops and services that merely carry the word ("놀이터통닭") are not landmarks.
const NOT_LANDMARK = /^(음식점|가정,생활|서비스,산업|의료,건강|부동산|금융,보험|문화,예술 > 키즈카페)/;
// Map words people say to how Korean maps file them: small playgrounds are usually listed as 어린이공원.
const ALIASES: Record<string, string[]> = {
  놀이터: ["어린이공원", "놀이터"],
  학교: ["초등학교", "중학교", "고등학교"],
};
const termsFor = (keyword: string) => ALIASES[keyword] ?? [keyword];
const matches = (keyword: string, d: KakaoDoc) =>
  !FACILITY.test(d.place_name) && !NOT_LANDMARK.test(d.category_name)
  && termsFor(keyword).some((t) => d.category_name.includes(t) || d.place_name.includes(t));

async function searchAround(keyword: string, lat: number, lng: number, radiusKm: number): Promise<KakaoDoc[]> {
  const key = process.env.KAKAO_REST_KEY;
  if (!key) return [];
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", keyword);
  url.searchParams.set("x", String(lng));
  url.searchParams.set("y", String(lat));
  url.searchParams.set("radius", String(Math.round(radiusKm * 1000)));
  url.searchParams.set("sort", "distance");
  url.searchParams.set("size", "15");
  const r = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!r.ok) return [];
  return ((await r.json()) as { documents?: KakaoDoc[] }).documents ?? [];
}

export async function findClueSpots(input: CluesInput, max = 8): Promise<CluesResult> {
  const center = await geocode(input.center_query);
  if (!center) throw new Error(`Could not geocode area: ${input.center_query}`);
  const landmarks = await extractLandmarks(input.words);
  const keywords = [...new Set(landmarks.map((l) => l.keyword.trim()).filter(Boolean))];

  const byKeyword = new Map<string, ClueSpot[]>();
  for (const keyword of keywords) {
    const seen = new Set<string>();
    const docs: KakaoDoc[] = [];
    for (const term of termsFor(keyword)) {
      for (const d of await searchAround(term, center.lat, center.lng, input.radius_km)) {
        if (seen.has(d.place_name) || !matches(keyword, d)) continue;
        seen.add(d.place_name);
        docs.push(d);
      }
    }
    byKeyword.set(keyword, docs.map((d) => ({
      name: d.place_name,
      keyword,
      geo: { lat: Number(d.y), lng: Number(d.x), display_name: d.place_name, source: "kakao" as const },
      distance_km: round1(Number(d.distance) / 1000),
      near: [],
    })));
  }

  // One place can match several of her words (an 어린이공원 is both a playground and a park): merge by name.
  const merged = new Map<string, { spot: ClueSpot; self: Set<string> }>();
  for (const [keyword, list] of byKeyword) {
    for (const spot of list) {
      const hit = merged.get(spot.name);
      if (hit) hit.self.add(keyword);
      else merged.set(spot.name, { spot: { ...spot }, self: new Set([keyword]) });
    }
  }
  const all = [...merged.values()];
  for (const m of all) {
    m.spot.keyword = [...m.self].join("·");
    m.spot.near = keywords.filter((k) => !m.self.has(k)
      && (byKeyword.get(k) ?? []).some((other) => other.name !== m.spot.name && haversineKm(m.spot.geo, other.geo) <= NEAR_KM));
  }
  // Best guess of where she is: the most pinpoint thing she named (a playground beats "a park"),
  // then places that have more of her other words within 300 m.
  const subject = PINPOINT.find((p) => keywords.includes(p)) ?? keywords[0];
  const score = (m: { spot: ClueSpot; self: Set<string> }) => (m.self.has(subject) ? 10 : 0) + m.self.size + m.spot.near.length;
  const spots = all
    .sort((a, b) => score(b) - score(a) || a.spot.distance_km - b.spot.distance_km)
    .slice(0, max)
    .map((m) => m.spot);
  return { center, radius_km: input.radius_km, landmarks, spots };
}
