import { NextResponse } from "next/server";

import { llmErrorBody, transcribe } from "@/lib/llm";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Multipart field 'audio' is required" }, { status: 400 });
  }

  const filename = audio instanceof File && audio.name ? audio.name : "audio.webm";
  try {
    return NextResponse.json({ text: await transcribe(audio, filename) });
  } catch (error) {
    console.error("transcribe failed", error);
    return NextResponse.json(llmErrorBody(error), { status: 502 });
  }
}
