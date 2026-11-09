import { ReplayRun } from "@/lib/contracts";
import { runReplay } from "@/lib/replay";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { case_id?: unknown };
    if (typeof body.case_id !== "string") throw new Error("case_id is required");
    return Response.json(ReplayRun.parse(await runReplay(body.case_id)));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Replay failed" }, { status: 400 });
  }
}
