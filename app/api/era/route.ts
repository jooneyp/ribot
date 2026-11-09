import { NextResponse } from "next/server";

import { EraInput } from "@/lib/contracts";
import { estimateEra } from "@/lib/llm";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = EraInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid EraInput" }, { status: 400 });

  const result = await estimateEra(parsed.data);
  return NextResponse.json(result);
}
