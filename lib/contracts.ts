// FROZEN CONTRACT — lanes must not edit. Ask Joe for changes.
import { z } from "zod";

export const LatLng = z.object({ lat: z.number(), lng: z.number() });
export type LatLng = z.infer<typeof LatLng>;

export const GeoResult = LatLng.extend({
  display_name: z.string(),
  source: z.enum(["kakao", "nominatim", "fixture"]),
});
export type GeoResult = z.infer<typeof GeoResult>;

export const PlaceType = z.enum(["home", "work", "school", "religion", "market", "family", "other"]);

export const Place = z.object({
  id: z.string(),
  name_then: z.string(), // as the family said it (Korean ok)
  type: PlaceType,
  modern_query: z.string(), // what to geocode on today's map
  evidence_quote: z.string(), // MUST be a verbatim substring of the source text (quote guard)
  confidence: z.number().min(0).max(1),
  geo: GeoResult.nullable(), // null until geocoded
});
export type Place = z.infer<typeof Place>;

export const Era = z.object({
  id: z.string(),
  label: z.string(),
  start_year: z.number().int().nullable(),
  end_year: z.number().int().nullable(),
  age_range: z.string().nullable(),
  places: z.array(Place),
});
export type Era = z.infer<typeof Era>;

export const LifeProfile = z.object({
  person: z.object({
    display_name: z.string(),
    birth_year: z.number().int().nullable(),
    hometown: z.string().nullable(),
  }),
  eras: z.array(Era),
  habits: z.array(z.object({ text: z.string(), evidence_quote: z.string() })),
  source_text: z.string(),
});
export type LifeProfile = z.infer<typeof LifeProfile>;

export const Intent = z.enum(["going_home", "going_to_work", "looking_for_someone", "other", "unknown"]);

export const EraEstimate = z.object({
  living_in: z.object({
    label: z.string(), // e.g. "just arrived in Seoul for work"
    approx_year: z.number().int().nullable(),
    year_range: z.tuple([z.number().int(), z.number().int()]).nullable(),
    age: z.number().int().nullable(),
  }),
  intent: Intent,
  evidence: z.array(z.object({ quote: z.string(), why: z.string() })), // quote = verbatim substring of input
  questions_for_family: z.array(z.string()).max(3),
});
export type EraEstimate = z.infer<typeof EraEstimate>;

export const EraInput = z.object({
  words: z.array(z.string()), // what she said
  report_words: z.string().nullable(), // what the family said when reporting
  age_band: z.string().nullable(), // e.g. "80s"
  now_year: z.number().int(),
});
export type EraInput = z.infer<typeof EraInput>;

export const ProfileInput = z.object({ text: z.string().min(1), display_name: z.string().nullable() });
export type ProfileInput = z.infer<typeof ProfileInput>;

export const HubKind = z.enum(["train", "bus", "subway", "other"]);
export const Hub = z.object({
  name: z.string(),
  kind: HubKind,
  line: z.string().nullable(),
  geo: GeoResult.nullable(),
  label: z.literal("proposed, verify"),
});
export type Hub = z.infer<typeof Hub>;

// Three search layers (design change 11:20): where she goes now, what is dangerous near home, where she'd go back to.
export const Layer = z.enum(["routine", "near_danger", "past"]);
export type Layer = z.infer<typeof Layer>;

export const Hazard = z.object({
  name: z.string(),
  kind: z.enum(["water", "hill"]),
  geo: GeoResult,
  distance_km: z.number(),
});
export type Hazard = z.infer<typeof Hazard>;

export const Candidate = z.object({
  rank: z.number().int().min(1),
  layer: z.enum(["routine", "past"]).optional(),
  place_id: z.string(),
  name: z.string(),
  era_id: z.string().nullable(),
  geo: GeoResult,
  distance_km_from_last_seen: z.number(),
  score: z.number(),
  score_parts: z.object({ era_match: z.number(), reachability: z.number(), confidence: z.number() }),
  why: z.string(),
});
export type Candidate = z.infer<typeof Candidate>;

export const FinderCard = z.object({ ko: z.array(z.string()).max(3), en: z.array(z.string()).max(3) });
export type FinderCard = z.infer<typeof FinderCard>;

export const PlanInput = z.object({
  profile: LifeProfile,
  era: EraEstimate,
  last_seen: z.object({ label: z.string(), query: z.string() }),
  elapsed_hours: z.number().min(0),
});
export type PlanInput = z.infer<typeof PlanInput>;

export const Plan = z.object({
  last_seen: z.object({ label: z.string(), geo: GeoResult }),
  elapsed_hours: z.number(),
  circle: z.object({
    center: LatLng,
    radius_km: z.number(),
    label: z.literal("radius search"),
    assumption: z.string(), // e.g. "assumed 3 km/h walk, capped at 5 km"
  }),
  candidates: z.array(Candidate),
  send_first: z.array(Hub), // empty unless top candidate > 15 km away
  finder_card: FinderCard,
  hazards: z.array(Hazard).optional(), // water and hills within hazard_ring_km of last seen, nearest first
  hazard_ring_km: z.number().optional(), // 3.2 km = manual's urban 75% distance
  check_order: z.array(Layer).optional(), // which layer to check first, from her words' intent
});
export type Plan = z.infer<typeof Plan>;

// Shape of data/cases_replay.json entries. Unknown = null/absent. Never invent fields.
export const ReplayCase = z
  .object({
    id: z.string(),
    role: z.string(),
    source_url: z.string(),
    source_note: z.string(),
    date: z.string().nullable().optional(),
    age_band: z.string().nullable().optional(),
    sex: z.string().nullable().optional(),
    home: z.string().nullable().optional(),
    her_words: z.array(z.string()).optional(),
    family_words: z.array(z.string()).optional(),
    report_words: z.string().nullable().optional(),
    profile_hometown: z.string().nullable().optional(),
    profile_hometown_provenance: z.string().optional(),
    profile_past_residence: z.string().nullable().optional(),
    profile_provenance: z.string().optional(),
    found: z.object({ place: z.string() }).passthrough(),
  })
  .passthrough();
export type ReplayCase = z.infer<typeof ReplayCase>;

export const ReplayRun = z.object({
  case_id: z.string(),
  era: EraEstimate,
  profile: LifeProfile.nullable(), // null for the hook case (era only)
  plan: Plan.nullable(),
});
export type ReplayRun = z.infer<typeof ReplayRun>;

export const RevealMetrics = z.object({
  case_id: z.string(),
  found: z.object({ label: z.string(), geo: GeoResult }),
  home_to_found_km: z.number().nullable(),
  inside_circle: z.boolean().nullable(),
  candidates: z.array(z.object({ rank: z.number().int(), name: z.string(), distance_to_found_km: z.number() })),
  nearest_candidate_rank: z.number().int().nullable(),
  computed_at: z.string(),
});
export type RevealMetrics = z.infer<typeof RevealMetrics>;

// "Then / Now" aerial photo pair for one place (same viewport, same source).
export const EraImagery = z.object({
  id: z.string(),
  place_label: z.string(),
  center: LatLng.nullable(),
  then: z.object({ year: z.number().int(), src: z.string() }),
  now: z.object({ year: z.number().int(), src: z.string() }),
  photo: z.object({ src: z.string(), caption: z.string() }).nullable(), // optional family photo (local only)
  source: z.string(),
  source_url: z.string(),
});
export type EraImagery = z.infer<typeof EraImagery>;

export const NumberCard = z.object({
  id: z.string(),
  value: z.string(),
  label: z.string(),
  period: z.string(),
  source_name: z.string(),
  source_url: z.string(),
  quote: z.string(), // verbatim from source
});
export type NumberCard = z.infer<typeof NumberCard>;

// Phone-call clues (design change 11:35): when she picks up, her fragments ("공원 같다. 놀이터, 학교 근처")
// become map spots inside the cell-tower radius.
export const CluesInput = z.object({
  words: z.array(z.string()).min(1),
  center_query: z.string(), // cell tower / last known area, geocodable
  radius_km: z.number().positive().max(5),
});
export type CluesInput = z.infer<typeof CluesInput>;

export const ClueSpot = z.object({
  name: z.string(),
  keyword: z.string(), // which of her landmark words this place matches
  geo: GeoResult,
  distance_km: z.number(),
  near: z.array(z.string()), // her other landmark words with a matching place within 300 m
});
export type ClueSpot = z.infer<typeof ClueSpot>;

export const CluesResult = z.object({
  center: GeoResult,
  radius_km: z.number(),
  landmarks: z.array(z.object({ keyword: z.string(), quote: z.string() })), // quote is verbatim from her words
  spots: z.array(ClueSpot), // best co-located first
});
export type CluesResult = z.infer<typeof CluesResult>;

// Map component props (lane C implements, lane D consumes)
export type MapViewProps = {
  plan?: Plan | null;
  profile?: LifeProfile | null;
  decade?: number | null; // era slider: show only places whose era overlaps this decade; null = all
  reveal?: RevealMetrics | null;
  imagery?: EraImagery[];
  onSelectImagery?: (id: string) => void;
  present?: boolean;
  clues?: CluesResult | null; // draw the tower radius + numbered clue spots
};
