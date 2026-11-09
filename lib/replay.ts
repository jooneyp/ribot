import fs from "node:fs";
import path from "node:path";
import type { Era, EraEstimate, LifeProfile, Place, ReplayCase, ReplayRun } from "./contracts";
import { ReplayCase as ReplayCaseSchema } from "./contracts";
import { estimateEra } from "./llm";
import { buildPlan } from "./plan";

export function replayCases(): ReplayCase[] {
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/cases_replay.json"), "utf8")) as { cases: unknown[] };
  return raw.cases.map((entry) => ReplayCaseSchema.parse(entry));
}

export function replayCase(caseId: string): ReplayCase {
  const found = replayCases().find((entry) => entry.id === caseId);
  if (!found) throw new Error(`Unknown replay case: ${caseId}`);
  return found;
}

export const stripParenthetical = (text: string) => text.replace(/\s*[（(][^）)]*[）)]\s*/g, " ").trim();

const unknownEra: EraEstimate = {
  living_in: { label: "unknown", approx_year: null, year_range: null, age: null },
  intent: "unknown",
  evidence: [],
  questions_for_family: [],
};

function makePlace(id: string, value: string, type: Place["type"]): Place {
  return {
    id,
    name_then: value,
    type,
    modern_query: value,
    evidence_quote: value,
    confidence: 1,
    geo: null,
  };
}

function profileFor(entry: ReplayCase): LifeProfile | null {
  const eras: Era[] = [];
  if (entry.profile_hometown) {
    eras.push({
      id: "era-hometown",
      label: "Hometown",
      start_year: null,
      end_year: null,
      age_range: null,
      places: [makePlace("place-hometown", entry.profile_hometown, "home")],
    });
  }
  if (entry.profile_past_residence) {
    eras.push({
      id: "era-past-residence",
      label: "Past residence",
      start_year: null,
      end_year: null,
      age_range: null,
      places: [makePlace("place-past-residence", entry.profile_past_residence, "home")],
    });
  }
  if (!eras.length) return null;
  const sourceText = [entry.profile_hometown, entry.profile_past_residence].filter(Boolean).join("\n");
  return {
    person: { display_name: `Case ${entry.id}`, birth_year: null, hometown: entry.profile_hometown ?? null },
    eras,
    habits: [],
    source_text: sourceText,
  };
}

export async function runReplay(caseId: string): Promise<ReplayRun> {
  const entry = replayCase(caseId);
  const dated = entry.date ?? (typeof entry.article_date === "string" ? entry.article_date : null);
  const nowYear = dated ? new Date(`${dated}T00:00:00Z`).getUTCFullYear() : 2026;
  const words = entry.her_words ?? (Array.isArray(entry.before_leaving_words) ? (entry.before_leaving_words as string[]) : []);
  const era = words.length === 0 && !entry.report_words
    ? unknownEra
    : await estimateEra({ words, report_words: entry.report_words ?? null, age_band: entry.age_band ?? null, now_year: nowYear });
  if (!entry.home) return { case_id: entry.id, era, profile: null, plan: null };
  // No family profile in the article: still plan the near-home layers (routine is empty, danger is not).
  const profile = profileFor(entry) ?? {
    person: { display_name: `Case ${entry.id}`, birth_year: null, hometown: null },
    eras: [],
    habits: [],
    source_text: "",
  };

  const city = stripParenthetical(entry.home);
  const lastSeenQuery = entry.id === "replay-naju" ? "광주광역시" : city;
  const level = typeof entry.home_level === "string" ? entry.home_level : "city";
  const plan = await buildPlan({
    profile,
    era,
    last_seen: { label: `${city} (${level}-level)`, query: lastSeenQuery },
    elapsed_hours: 1,
  });
  return { case_id: entry.id, era, profile, plan };
}
