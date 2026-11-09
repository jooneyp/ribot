"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";

export default function Recorder({ onText, onError }: { onText: (text: string) => void; onError: (message: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function choose(file?: File) {
    if (!file) return;
    setName(file.name); setBusy(true); onError(null);
    try { onText((await api.transcribe(file, file.name)).text); }
    catch (error) { onError(error instanceof Error ? error.message : "Could not transcribe this file."); }
    finally { setBusy(false); }
  }

  return <div className="recorder"><input ref={input} type="file" accept="audio/*" hidden onChange={(e) => void choose(e.target.files?.[0])}/><button className="secondary" type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Transcribing…" : "Choose phone recording"}</button><small>{name ?? "Audio file only · no recording in browser"}</small></div>;
}
