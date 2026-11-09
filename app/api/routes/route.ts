import { RoutesInput, RoutesResult } from "@/lib/contracts";
import { buildRoutes } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = RoutesInput.parse(await request.json());
    return Response.json(RoutesResult.parse(await buildRoutes(input.plan, input.elapsed_hours)));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Route failed" }, { status: 400 });
  }
}
