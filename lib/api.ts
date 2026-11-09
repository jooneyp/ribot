// FROZEN (Joe). Browser client for all API routes. `?mock=1` returns fixtures without network.
import type { EraEstimate, EraImagery, EraInput, LifeProfile, Plan, PlanInput, ProfileInput, ReplayCase, ReplayRun, RevealMetrics } from "./contracts";
import eraFx from "@/fixtures/era_estimate.json";
import profileFx from "@/fixtures/life_profile.json";
import planFx from "@/fixtures/plan.json";
import revealFx from "@/fixtures/reveal.json";
import runFx from "@/fixtures/replay_run.json";
import imageryFx from "@/fixtures/era_imagery.json";
import cases from "@/data/cases_replay.json";

export const isMock = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("mock");

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${url} ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}

export const api = {
  era: (b: EraInput) => (isMock() ? Promise.resolve(eraFx as EraEstimate) : post<EraEstimate>("/api/era", b)),
  profile: (b: ProfileInput) => (isMock() ? Promise.resolve(profileFx as LifeProfile) : post<LifeProfile>("/api/profile", b)),
  geocodeProfile: (p: LifeProfile) => (isMock() ? Promise.resolve(profileFx as LifeProfile) : post<LifeProfile>("/api/geocode", { profile: p })),
  plan: (b: PlanInput) => (isMock() ? Promise.resolve(planFx as Plan) : post<Plan>("/api/plan", b)),
  cases: async (): Promise<ReplayCase[]> => (cases as { cases: ReplayCase[] }).cases,
  replayRun: (case_id: string) => (isMock() ? Promise.resolve(runFx as ReplayRun) : post<ReplayRun>("/api/replay/run", { case_id })),
  reveal: (case_id: string, plan: Plan) => (isMock() ? Promise.resolve({ ...(revealFx as RevealMetrics), case_id }) : post<RevealMetrics>("/api/replay/reveal", { case_id, plan })),
  imagery: async (): Promise<EraImagery[]> => {
    if (isMock()) return imageryFx as EraImagery[];
    const r = await fetch("/api/imagery");
    return r.json();
  },
  transcribe: async (audio: Blob, filename = "audio.webm"): Promise<{ text: string }> => {
    if (isMock()) return { text: (profileFx as LifeProfile).source_text };
    const fd = new FormData();
    fd.append("audio", audio, filename);
    const r = await fetch("/api/transcribe", { method: "POST", body: fd });
    if (!r.ok) throw new Error(`/api/transcribe ${r.status}`);
    return r.json();
  },
};
