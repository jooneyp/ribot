import { NextResponse } from "next/server";

import { ProfileInput } from "@/lib/contracts";
import { extractProfile } from "@/lib/llm";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = ProfileInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid ProfileInput" }, { status: 400 });

  const result = await extractProfile(parsed.data);
  return NextResponse.json(result);
}
