// OWNER: lane A (llm). Signatures are the contract; bodies are stubs returning fixtures until lane A lands.
import type { EraEstimate, EraInput, FinderCard, HubKind, LifeProfile, ProfileInput } from "./contracts";
import eraFx from "@/fixtures/era_estimate.json";
import profileFx from "@/fixtures/life_profile.json";
import planFx from "@/fixtures/plan.json";
import type { z } from "zod";

export type HubProposal = { name: string; kind: z.infer<typeof HubKind>; line: string | null; query: string };

/** Her words → which era of her life she is living in. Evidence quotes must pass quoteGuard against the input. */
export async function estimateEra(_input: EraInput): Promise<EraEstimate> {
  return eraFx as EraEstimate;
}

/** Family free text (typed or transcribed) → LifeProfile with geo = null. Quotes must pass quoteGuard. */
export async function extractProfile(_input: ProfileInput): Promise<LifeProfile> {
  return profileFx as LifeProfile;
}

/** Departure hubs from the last-seen city toward a far destination. Labelled "proposed, verify" by the caller. */
export async function proposeHubs(_input: { from_label: string; to_label: string }): Promise<HubProposal[]> {
  return [{ name: "수서역 SRT", kind: "train", line: "SRT 호남선", query: "수서역" }];
}

/** 3 short Korean lines + English for whoever finds her: don't argue, join her reality, guide gently. */
export async function finderCard(_input: { era: EraEstimate; profile: LifeProfile }): Promise<FinderCard> {
  return planFx.finder_card as FinderCard;
}

/** Audio → text (Korean). */
export async function transcribe(_audio: Blob, _filename: string): Promise<string> {
  return (profileFx as LifeProfile).source_text;
}
