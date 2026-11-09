import fs from "node:fs";
import path from "node:path";
import { Plan, RevealMetrics } from "@/lib/contracts";
import { geocode } from "@/lib/geo";
import { haversineKm, insideCircle, revealDistances, round1 } from "@/lib/metrics";
import { replayCase, stripParenthetical } from "@/lib/replay";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { case_id?: unknown; plan?: unknown };
    if (typeof body.case_id !== "string") throw new Error("case_id is required");
    const plan = Plan.parse(body.plan);
    const entry = replayCase(body.case_id);
    const query = entry.id === "replay-srt" ? "수서역" : entry.id === "replay-naju" ? "나주시 영산동" : stripParenthetical(entry.found.place);
    const foundGeo = await geocode(query);
    if (!foundGeo) throw new Error(`Could not geocode found place: ${query}`);
    const distances = revealDistances(foundGeo, plan.candidates);
    const result = RevealMetrics.parse({
      case_id: entry.id,
      found: { label: entry.found.place, geo: foundGeo },
      home_to_found_km: round1(haversineKm(plan.last_seen.geo, foundGeo)),
      inside_circle: insideCircle(plan.circle.center, plan.circle.radius_km, foundGeo),
      candidates: distances.rows,
      nearest_candidate_rank: distances.nearest_rank,
      computed_at: new Date().toISOString(),
    });
    const output = path.join(process.cwd(), "results", `replay_${entry.id}.json`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Reveal failed" }, { status: 400 });
  }
}
