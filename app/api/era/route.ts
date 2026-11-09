import { NextResponse } from "next/server";

import { EraInput } from "@/lib/contracts";
import { estimateEra, llmErrorBody } from "@/lib/llm";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = EraInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid EraInput" }, { status: 400 });

  try {
    return NextResponse.json(await estimateEra(parsed.data));
  } catch (error) {
    console.error("estimateEra failed", error);
    return NextResponse.json(llmErrorBody(error), { status: 502 });
  }
}
