import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { EraEstimate, LifeProfile, Plan, RevealMetrics, ReplayCase, EraImagery, NumberCard, ReplayRun } from "@/lib/contracts";

const read = (p: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

describe("fixtures and data match the frozen contract", () => {
  it("fixtures", () => {
    EraEstimate.parse(read("fixtures/era_estimate.json"));
    LifeProfile.parse(read("fixtures/life_profile.json"));
    Plan.parse(read("fixtures/plan.json"));
    for (const r of Object.values(read("fixtures/reveal.json"))) RevealMetrics.parse(r);
    const runs = read("fixtures/replay_run.json");
    for (const id of ["hook-1962", "replay-srt", "replay-naju"]) expect(ReplayRun.parse(runs[id]).case_id).toBe(id);
    for (const e of read("fixtures/era_imagery.json")) EraImagery.parse(e);
  });
  it("data", () => {
    const cases = read("data/cases_replay.json").cases;
    expect(cases.length).toBeGreaterThan(0);
    for (const c of cases) ReplayCase.parse(c);
    for (const n of read("data/numbers.json").numbers) NumberCard.parse(n);
    for (const e of read("data/era_imagery.json")) EraImagery.parse(e);
  });
});
