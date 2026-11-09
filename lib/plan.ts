import type { Candidate, Era, FinderCard, GeoResult, Hub, Place, Plan, PlanInput } from "./contracts";
import { geocode } from "./geo";
import { proposeHubs } from "./llm";
import { circleRadiusKm, haversineKm, round1 } from "./metrics";

function overlaps(era: Era, range: [number, number] | null): boolean {
  if (!range || era.start_year === null || era.end_year === null) return true;
  return era.start_year <= range[1] && era.end_year >= range[0];
}

type SelectedPlace = { place: Place; era: Era | null; eraMatch: number; isHometown: boolean };

const FINDER_CARDS: Record<PlanInput["era"]["intent"], FinderCard> = {
  going_home: {
    ko: ["따지지 마세요.", "\"고향 가세요? 같이 가요.\"", "천천히, 옆에서 걸어 주세요."],
    en: ["Don't argue.", "\"Going home? Let's go together.\"", "Walk slowly, beside them."],
  },
  going_to_work: {
    ko: ["따지지 마세요.", "\"일하러 가세요? 같이 가요.\"", "천천히, 옆에서 걸어 주세요."],
    en: ["Don't argue.", "\"Going to work? Let's go together.\"", "Walk slowly, beside them."],
  },
  looking_for_someone: {
    ko: ["따지지 마세요.", "\"누구를 찾으세요? 같이 찾아봐요.\"", "천천히, 옆에서 걸어 주세요."],
    en: ["Don't argue.", "\"Who are you looking for? Let's look together.\"", "Walk slowly, beside them."],
  },
  other: {
    ko: ["따지지 마세요.", "지금의 이야기를 차분히 들어 주세요.", "천천히, 옆에서 걸어 주세요."],
    en: ["Don't argue.", "Listen calmly to their present reality.", "Walk slowly, beside them."],
  },
  unknown: {
    ko: ["따지지 마세요.", "안전한 곳에서 차분히 이야기를 들어 주세요.", "천천히, 옆에서 걸어 주세요."],
    en: ["Don't argue.", "Listen calmly in a safe place.", "Walk slowly, beside them."],
  },
};

function whyText(selected: SelectedPlace, range: [number, number] | null, km: number): string {
  const what = selected.isHometown ? "Hometown (family profile)" : `${selected.era?.label ?? "Profile"} place`;
  const era = !range
    ? "era unknown, all eras kept"
    : selected.eraMatch === 1
      ? `era overlaps ${range[0]}–${range[1]}`
      : `outside ${range[0]}–${range[1]}, kept as hometown`;
  return `${what} · ${era} · ${round1(km)} km from last seen`;
}

function selectPlaces(input: PlanInput): SelectedPlace[] {
  const range = input.era.living_in.year_range;
  const selected = new Map<string, SelectedPlace>();
  for (const era of input.profile.eras) {
    if (!overlaps(era, range)) continue;
    for (const place of era.places) selected.set(place.id, { place, era, eraMatch: 1, isHometown: false });
  }

  const hometown = input.profile.person.hometown?.trim();
  if (hometown) {
    const allPlaces = input.profile.eras.flatMap((era) => era.places.map((place) => ({ era, place })));
    const home = allPlaces.find(({ place }) =>
      place.name_then.includes(hometown) || place.modern_query.includes(hometown) || hometown.includes(place.name_then),
    );
    if (home) {
      const eraMatch = overlaps(home.era, range) ? 1 : 0.3;
      selected.set(home.place.id, { place: home.place, era: home.era, eraMatch, isHometown: true });
    } else {
      selected.set("person-hometown", {
        place: {
          id: "person-hometown",
          name_then: hometown,
          type: "home",
          modern_query: hometown,
          evidence_quote: hometown,
          confidence: 1,
          geo: null,
        },
        era: null,
        eraMatch: 0.3,
        isHometown: true,
      });
    }
  }
  return [...selected.values()];
}

async function placeGeo(place: Place): Promise<GeoResult | null> {
  return place.geo ?? geocode(place.modern_query);
}

export async function buildPlan(input: PlanInput, assumption = "assumed 3 km/h walk, capped at 5 km"): Promise<Plan> {
  const lastSeenGeo = await geocode(input.last_seen.query);
  if (!lastSeenGeo) throw new Error(`Could not geocode last seen place: ${input.last_seen.query}`);

  const range = input.era.living_in.year_range;
  const candidates = (await Promise.all(selectPlaces(input).map(async (selected) => {
    const { place, era, eraMatch } = selected;
    const geo = await placeGeo(place);
    if (!geo) return null;
    const distance = haversineKm(lastSeenGeo, geo);
    const reachability = distance <= 5
      ? 1
      : input.era.intent === "going_home" || input.era.intent === "going_to_work"
        ? 0.8
        : Math.max(0.2, 1 - distance / 300);
    const score = eraMatch * reachability * place.confidence;
    return {
      rank: 1,
      place_id: place.id,
      name: place.name_then,
      era_id: era?.id ?? null,
      geo,
      distance_km_from_last_seen: round1(distance),
      score,
      score_parts: { era_match: eraMatch, reachability, confidence: place.confidence },
      why: whyText(selected, range, distance),
    } satisfies Candidate;
  }))).filter((candidate): candidate is Candidate => candidate !== null);

  candidates.sort((a, b) => b.score - a.score || a.distance_km_from_last_seen - b.distance_km_from_last_seen);
  candidates.forEach((candidate, index) => { candidate.rank = index + 1; });

  let sendFirst: Hub[] = [];
  if (candidates[0] && candidates[0].distance_km_from_last_seen > 15) {
    const proposals = await proposeHubs({ from_label: input.last_seen.label, to_label: candidates[0].name });
    sendFirst = await Promise.all(proposals.map(async (proposal) => {
      const geo = await geocode(proposal.query);
      return {
        name: proposal.name,
        kind: proposal.kind,
        line: proposal.line,
        geo,
        label: "proposed, verify" as const,
      };
    }));
  }

  return {
    last_seen: { label: input.last_seen.label, geo: lastSeenGeo },
    elapsed_hours: input.elapsed_hours,
    circle: {
      center: { lat: lastSeenGeo.lat, lng: lastSeenGeo.lng },
      radius_km: circleRadiusKm(input.elapsed_hours),
      label: "radius search",
      assumption,
    },
    candidates,
    send_first: sendFirst,
    finder_card: FINDER_CARDS[input.era.intent],
  };
}
