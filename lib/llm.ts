import { createHash } from "node:crypto";

import OpenAI, { toFile } from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
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

// Strict JSON Schema does not accept the tuple-shaped schema emitted for z.tuple.
// The model emits a two-item array; the frozen contract validates the final value.
const EraEstimateOutput = EraEstimate.extend({
  living_in: EraEstimate.shape.living_in.extend({
    year_range: z.array(z.number().int()).length(2).nullable(),
  }),
});

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

const Transcription = z.object({ text: z.string() });
const resultCache = new Map<string, unknown>();
let openai: OpenAI | undefined;

/** Her words → which era of her life she is living in. Evidence quotes must pass quoteGuard against the input. */
export async function estimateEra(input: EraInput): Promise<EraEstimate> {
  return cached("era", input, async () => {
    const output = await structuredCall(ERA_SYSTEM_PROMPT, input, EraEstimateOutput, "era_estimate");
    const source = [...input.words, input.report_words].filter((value): value is string => Boolean(value)).join("\n");

    return EraEstimate.parse({
      ...output,
      evidence: keepGrounded(output.evidence, source),
    });
  });
}

/** Family free text (typed or transcribed) → LifeProfile with geo = null. Quotes must pass quoteGuard. */
export async function extractProfile(input: ProfileInput): Promise<LifeProfile> {
  return cached("profile", input, async () => {
    const output = await structuredCall(PROFILE_SYSTEM_PROMPT, input, LifeProfile, "life_profile");
    const eras = output.eras
      .map((era) => ({
        ...era,
        places: era.places.filter(
          (place) => isGrounded(place.evidence_quote, input.text) && isGrounded(place.name_then, input.text),
        ),
      }))
      .sort((a, b) => (a.start_year ?? Number.POSITIVE_INFINITY) - (b.start_year ?? Number.POSITIVE_INFINITY));
    const hometown = output.person.hometown;

    return LifeProfile.parse({
      ...output,
      person: {
        ...output.person,
        display_name: input.display_name ?? "unknown",
        hometown: hometown && isGrounded(hometown, input.text) ? hometown : null,
      },
      eras,
      habits: output.habits.filter((habit) => isGrounded(habit.evidence_quote, input.text)),
      source_text: input.text,
    });
  });
}

/** Departure hubs from the last-seen city toward a far destination. Labelled "proposed, verify" by the caller. */
export async function proposeHubs(input: { from_label: string; to_label: string }): Promise<HubProposal[]> {
  return cached("hubs", input, async () => {
    const output = await structuredCall(HUBS_SYSTEM_PROMPT, input, HubProposals, "hub_proposals");
    return output.hubs;
  });
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

/** Audio → text (Korean), using only the local Whisper-compatible server. */
export async function transcribe(audio: Blob, filename: string): Promise<string> {
  const base = process.env.RIBOT_STT_BASE_URL || "http://127.0.0.1:8200/v1";
  const endpoint = base.endsWith("/audio/transcriptions")
    ? base
    : `${base.replace(/\/$/, "")}/audio/transcriptions`;
  const form = new FormData();
  form.set("file", await toFile(audio, filename));
  form.set("model", process.env.RIBOT_STT_MODEL || "large-v3-turbo");
  form.set("language", "ko");
  form.set("response_format", "json");

  const response = await fetch(endpoint, { method: "POST", body: form });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Transcription failed (${response.status})`);
  return Transcription.parse(body).text;
}

async function structuredCall<T extends z.ZodType>(
  system: string,
  input: unknown,
  schema: T,
  schemaName: string,
): Promise<z.output<T>> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await client().chat.completions.create({
      model: textModel(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(input) },
      ],
      response_format: zodResponseFormat(schema, schemaName),
    });

    try {
      const content = completion.choices[0]?.message.content;
      if (!content) throw new SyntaxError("The model returned no structured output");
      return schema.parse(JSON.parse(content));
    } catch (error) {
      const parseFailure = error instanceof SyntaxError || error instanceof z.ZodError;
      if (!parseFailure || attempt === 1) throw error;
    }
  }

  throw new Error("Unreachable structured-output retry state");
}

async function cached<T>(namespace: string, input: unknown, load: () => Promise<T>): Promise<T> {
  const key = `${namespace}:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
  if (resultCache.has(key)) return resultCache.get(key) as T;
  const result = await load();
  resultCache.set(key, result);
  return result;
}

function client(): OpenAI {
  const baseURL = process.env.OPENAI_BASE_URL || "http://127.0.0.1:8650/v1";
  if (new URL(baseURL).hostname === "api.openai.com") {
    throw new Error("Ribot only permits the local Codex proxy, not api.openai.com");
  }
  openai ??= new OpenAI({ baseURL, apiKey: process.env.OPENAI_API_KEY || "unused" });
  return openai;
}

const textModel = () => process.env.RIBOT_LLM_MODEL || "gpt-5.6-sol";

/** Route helper: upstream failure → JSON body with the provider's error code, never a blank 500. */
export function llmErrorBody(error: unknown): { error: string; code: string | null } {
  const err = error as { message?: string; code?: string | null; type?: string };
  return { error: err?.message ?? "LLM call failed", code: err?.code ?? err?.type ?? null };
}
