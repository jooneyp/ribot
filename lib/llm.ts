import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import {
  EraEstimate,
  HubKind,
  LifeProfile,
  type EraInput,
  type FinderCard,
  type ProfileInput,
} from "./contracts";
import { ERA_SYSTEM_PROMPT } from "./prompts/era";
import { HUBS_SYSTEM_PROMPT } from "./prompts/hubs";
import { PROFILE_SYSTEM_PROMPT } from "./prompts/profile";
import { isGrounded, keepGrounded } from "./quoteGuard";

export type HubProposal = { name: string; kind: z.infer<typeof HubKind>; line: string | null; query: string };

// OpenAI strict schemas do not support JSON Schema's tuple-form `items` emitted by z.tuple.
// Accept an exactly two-item array from the model, then validate it against the frozen contract below.
const EraEstimateOutput = EraEstimate.extend({
  living_in: EraEstimate.shape.living_in.extend({
    year_range: z.array(z.number().int()).length(2).nullable(),
  }),
});

/** Her words → which era of her life she is living in. Evidence quotes must pass quoteGuard against the input. */
export async function estimateEra(input: EraInput): Promise<EraEstimate> {
  const response = await client().responses.parse({
    model: textModel(),
    instructions: ERA_SYSTEM_PROMPT,
    input: JSON.stringify(input),
    text: { format: zodTextFormat(EraEstimateOutput, "era_estimate") },
  });
  if (!response.output_parsed) throw new Error("The era model returned no structured output");

  const source = [...input.words, input.report_words].filter((value): value is string => Boolean(value)).join("\n");
  return EraEstimate.parse({
    ...response.output_parsed,
    evidence: keepGrounded(response.output_parsed.evidence, source),
  });
}

/** Family free text (typed or transcribed) → LifeProfile with geo = null. Quotes must pass quoteGuard. */
export async function extractProfile(input: ProfileInput): Promise<LifeProfile> {
  const response = await client().responses.parse({
    model: textModel(),
    instructions: PROFILE_SYSTEM_PROMPT,
    input: JSON.stringify(input),
    text: { format: zodTextFormat(LifeProfile, "life_profile") },
  });
  if (!response.output_parsed) throw new Error("The profile model returned no structured output");

  const parsed = response.output_parsed;
  const eras = parsed.eras
    .map((era) => ({
      ...era,
      places: era.places.filter(
        (place) => isGrounded(place.evidence_quote, input.text) && isGrounded(place.name_then, input.text),
      ),
    }))
    .sort((a, b) => (a.start_year ?? Number.POSITIVE_INFINITY) - (b.start_year ?? Number.POSITIVE_INFINITY));

  return LifeProfile.parse({
    ...parsed,
    person: { ...parsed.person, display_name: input.display_name ?? parsed.person.display_name },
    eras,
    habits: parsed.habits.filter((habit) => isGrounded(habit.evidence_quote, input.text)),
    source_text: input.text,
  });
}

/** Departure hubs from the last-seen city toward a far destination. Labelled "proposed, verify" by the caller. */
export async function proposeHubs(input: { from_label: string; to_label: string }): Promise<HubProposal[]> {
  const response = await client().responses.parse({
    model: textModel(),
    instructions: HUBS_SYSTEM_PROMPT,
    input: JSON.stringify(input),
    text: { format: zodTextFormat(HubProposals, "hub_proposals") },
  });
  if (!response.output_parsed) throw new Error("The hub model returned no structured output");
  return response.output_parsed.hubs;
}

/** 3 short Korean lines + English for whoever finds her: don't argue, join her reality, guide gently. */
export async function finderCard(input: { era: EraEstimate; profile: LifeProfile }): Promise<FinderCard> {
  const middle: Record<EraEstimate["intent"], { ko: string; en: string }> = {
    going_home: { ko: "고향 가세요? 같이 가요.", en: "Are you going home? I'll go with you." },
    going_to_work: { ko: "출근하세요? 같이 가요.", en: "Are you going to work? I'll go with you." },
    looking_for_someone: { ko: "누구 찾으세요? 같이 찾아봐요.", en: "Are you looking for someone? Let's look together." },
    other: { ko: "어디 가세요? 같이 가요.", en: "Where are you going? I'll go with you." },
    unknown: { ko: "어디 가세요? 같이 가요.", en: "Where are you going? I'll go with you." },
  };
  const selected = middle[input.era.intent];
  return {
    ko: ["따지지 마세요.", selected.ko, "천천히, 옆에서 걸어 주세요."],
    en: ["Do not argue.", selected.en, "Walk slowly beside her."],
  };
}

/** Audio → text (Korean). */
export async function transcribe(audio: Blob, filename: string): Promise<string> {
  const result = await client().audio.transcriptions.create({
    file: await toFile(audio, filename),
    model: process.env.RIBOT_STT_MODEL || "gpt-4o-transcribe",
    language: "ko",
  });
  return result.text;
}

const HubProposals = z.object({
  hubs: z
    .array(
      z.object({
        name: z.string(),
        kind: HubKind,
        line: z.string().nullable(),
        query: z.string(),
      }),
    )
    .max(3),
});

let openai: OpenAI | undefined;

function client(): OpenAI {
  openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

const textModel = () => process.env.RIBOT_LLM_MODEL || "gpt-4.1";
