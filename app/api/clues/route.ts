import { CluesInput, CluesResult } from "@/lib/contracts";
import { findClueSpots } from "@/lib/clues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = CluesInput.parse(await request.json());
    return Response.json(CluesResult.parse(await findClueSpots(input)));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Clue search failed" }, { status: 400 });
  }
}
