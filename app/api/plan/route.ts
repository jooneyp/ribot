import { Plan, PlanInput } from "@/lib/contracts";
import { buildPlan } from "@/lib/plan";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = PlanInput.parse(await request.json());
    return Response.json(Plan.parse(await buildPlan(input)));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Planning failed" }, { status: 400 });
  }
}
