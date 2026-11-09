"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import Recorder from "@/components/Recorder";
import ThenNow from "@/components/map/ThenNow";
import { api } from "@/lib/api";
import type { EraEstimate, EraImagery, LifeProfile, ReplayCase, ReplayRun, RevealMetrics } from "@/lib/contracts";

const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });
type Tab = "replay" | "words" | "profile";
const unknown = (value: string | number | null | undefined) => value ?? "unknown";

function HighlightedWords({ words, evidence }: { words: string[]; evidence: EraEstimate["evidence"] }) {
  const quotes = evidence.map((item) => item.quote).filter(Boolean);
  return <div className="spoken-lines result-words">{words.map((line, index) => {
    const quote = quotes.find((item) => line.includes(item));
    if (!quote) return <p key={index}>{line}</p>;
    const [before, ...after] = line.split(quote);
    return <p key={index}>{before}<mark>{quote}</mark>{after.join(quote)}</p>;
  })}</div>;
}

function ResultPanel({ run, reveal, words, busy, error, onReveal }: { run: ReplayRun | null; reveal: RevealMetrics | null; words: string[]; busy: boolean; error: string | null; onReveal: () => void }) {
  if (error) return <aside className="results"><div className="eyebrow">Could not complete</div><p className="error" role="alert">{error}</p></aside>;
  if (busy) return <aside className="results loading" aria-live="polite">Reading her words…</aside>;
  if (!run) return <aside className="results empty"><span>01</span><p>Choose a replay or enter her words.</p><span>02</span><p>Ribot connects the remembered era to places today.</p></aside>;
  const { era, plan } = run;
  const closest = reveal?.candidates.find((candidate) => candidate.rank === reveal.nearest_candidate_rank) ?? reveal?.candidates[0];
  return <aside className="results" aria-live="polite">
    <div className="eyebrow">Era estimate</div><h2>Living in: {unknown(era.living_in.label)}</h2><p className="result-meta">~{unknown(era.living_in.approx_year)} · age ~{unknown(era.living_in.age)}</p>
    {era.evidence.length > 0 && <HighlightedWords words={words} evidence={era.evidence}/>}<section className="result-section"><span className="section-label">Intent</span><strong>{era.intent.replaceAll("_", " ")}</strong></section>
    {plan && <><section className="result-section"><span className="section-label">Search first</span><ol className="rank-list">{plan.candidates.map((candidate) => <li key={`${candidate.rank}-${candidate.place_id}`}><b>#{candidate.rank} {candidate.name}</b><span>{candidate.distance_km_from_last_seen.toFixed(1)} km · <abbr title={`era match ${candidate.score_parts.era_match} × reachability ${candidate.score_parts.reachability} × confidence ${candidate.score_parts.confidence}`}>{candidate.score.toFixed(2)} score</abbr></span></li>)}</ol></section>
      {plan.send_first.length > 0 && <section className="result-section"><span className="section-label">Send first</span>{plan.send_first.map((hub) => <div className="hub" key={hub.name}><span aria-hidden>🚆</span><div><b>{hub.name}</b><small>{hub.line ?? "unknown"} · {hub.label}</small></div></div>)}</section>}
      <section className="finder"><span className="section-label">Finder card</span>{plan.finder_card.ko.map((line, i) => <div key={line}><p lang="ko">{line}</p><small>{plan.finder_card.en[i] ?? ""}</small></div>)}</section>{!reveal && <button className="primary reveal-button" onClick={onReveal}>Reveal</button>}</>}
    {reveal && <section className="metrics"><span className="section-label">Found · {reveal.found.label}</span><p>Found <b>{unknown(reveal.home_to_found_km)} km</b> from home · <b>{closest ? closest.distance_to_found_km : "unknown"} km</b> from Ribot #{unknown(closest?.rank)}</p><p>inside radius search: <b>{reveal.inside_circle == null ? "unknown" : reveal.inside_circle ? "yes" : "no"}</b></p></section>}
  </aside>;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("replay"), [cases, setCases] = useState<ReplayCase[]>([]), [selectedId, setSelectedId] = useState("hook-1962");
  const [imagery, setImagery] = useState<EraImagery[]>([]), [run, setRun] = useState<ReplayRun | null>(null), [reveal, setReveal] = useState<RevealMetrics | null>(null);
  const [hookRevealed, setHookRevealed] = useState(false), [revealReady, setRevealReady] = useState(false), [typedWords, setTypedWords] = useState<string[]>([]), [typingDone, setTypingDone] = useState(false);
  const [wordsText, setWordsText] = useState(""), [ageBand, setAgeBand] = useState(""), [profileText, setProfileText] = useState(""), [profile, setProfile] = useState<LifeProfile | null>(null);
  const [decade, setDecade] = useState<number | null>(null), [selectedImagery, setSelectedImagery] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [present, setPresent] = useState(false);
  const selectedCase = cases.find((item) => item.id === selectedId) ?? null, isHook = selectedId === "hook-1962" && tab === "replay";
  const shownWords = tab === "replay" ? selectedCase?.her_words ?? (selectedCase?.report_words ? [selectedCase.report_words] : []) : wordsText.split("\n").map((w) => w.trim()).filter(Boolean);
  const imageryItem = imagery.find((item) => item.id === selectedImagery) ?? null;

  useEffect(() => { setPresent(new URLSearchParams(window.location.search).has("present")); api.cases().then((items) => setCases(items.filter((item) => item.role !== "README only"))).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load cases.")); api.imagery().then(setImagery).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load imagery.")); }, []);
  useEffect(() => {
    setRun(null); setReveal(null); setHookRevealed(false); setRevealReady(false); setError(null);
    if (!isHook || !selectedCase?.her_words) { setTypedWords([]); setTypingDone(true); return; }
    setTypedWords([]); setTypingDone(false); let cancelled = false;
    void (async () => { for (const line of selectedCase.her_words ?? []) { let current = ""; setTypedWords((old) => [...old, ""]); for (const char of line) { await new Promise((resolve) => setTimeout(resolve, 40)); if (cancelled) return; current += char; setTypedWords((old) => [...old.slice(0, -1), current]); } await new Promise((resolve) => setTimeout(resolve, 600)); } if (!cancelled) setTypingDone(true); })();
    return () => { cancelled = true; };
  }, [isHook, selectedCase]);
  useEffect(() => { if (!run || !isHook) return; const timer = window.setTimeout(() => setRevealReady(true), 1000); return () => window.clearTimeout(timer); }, [run, isHook]);

  const execute = useCallback(async () => {
    setBusy(true); setError(null); setReveal(null); setHookRevealed(false); setRevealReady(false);
    try { if (tab === "replay") { const next = await api.replayRun(selectedId); if (!next) throw new Error(`No replay fixture for ${selectedId}.`); setRun(next); } else if (tab === "words") { const words = wordsText.split("\n").map((item) => item.trim()).filter(Boolean); if (!words.length) throw new Error("Enter at least one utterance."); const era = await api.era({ words, report_words: null, age_band: ageBand || null, now_year: new Date().getFullYear() }); setRun({ case_id: "her-words", era, profile: null, plan: null }); } }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(false); }
  }, [ageBand, selectedId, tab, wordsText]);
  const buildProfile = useCallback(async () => { if (!profileText.trim()) { setError("Paste a family profile or choose an audio file."); return; } setBusy(true); setError(null); setRun(null); setReveal(null); try { const parsed = await api.profile({ text: profileText, display_name: null }); const geocoded = await api.geocodeProfile(parsed); setProfile(geocoded); const firstYear = geocoded.eras.map((era) => era.start_year).find((year): year is number => year != null); setDecade(firstYear == null ? null : Math.floor(firstYear / 10) * 10); } catch (e) { setError(e instanceof Error ? e.message : "Could not build the profile."); } finally { setBusy(false); } }, [profileText]);
  const doReveal = useCallback(async () => { if (!run?.plan) return; setBusy(true); setError(null); try { setReveal(await api.reveal(run.case_id, run.plan)); } catch (e) { setError(e instanceof Error ? e.message : "Could not reveal the result."); } finally { setBusy(false); } }, [run]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (!present || event.code !== "Space" || ["INPUT", "TEXTAREA", "BUTTON"].includes((event.target as HTMLElement).tagName)) return; event.preventDefault(); if (!run) void execute(); else if (isHook && revealReady) setHookRevealed(true); else if (run.plan && !reveal) void doReveal(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [doReveal, execute, isHook, present, reveal, revealReady, run]);
  const decades = useMemo(() => { if (!profile) return []; const years = profile.eras.flatMap((era) => [era.start_year, era.end_year]).filter((year): year is number => year != null); if (!years.length) return []; const start = Math.floor(Math.min(...years) / 10) * 10, end = Math.floor(Math.max(...years) / 10) * 10; return Array.from({ length: (end - start) / 10 + 1 }, (_, i) => start + i * 10); }, [profile]);
  const matchingImagery = useMemo(() => !profile ? [] : imagery.filter((image) => profile.eras.some((era) => { if (era.start_year != null && image.then.year + 15 < era.start_year) return false; if (era.end_year != null && image.then.year - 15 > era.end_year) return false; return era.places.some((place) => place.geo && image.center && Math.hypot((place.geo.lat - image.center.lat) * 111, (place.geo.lng - image.center.lng) * 90) < 15); })), [imagery, profile]);

  return <main className={`app-shell ${present ? "present" : ""}`}><header className="topbar"><div><span className="brand-mark" aria-hidden>R</span><h1>Ribot <span>— Search where she&apos;s from</span></h1></div><p className="mode">{present ? "Presentation" : "Prototype · family-guided search"}</p></header><section className="workspace">
    <aside className="input-panel"><nav className="tabs" aria-label="Input mode">{(["replay", "words", "profile"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "words" ? "Her words" : item === "profile" ? "Family profile" : "Replay"}</button>)}</nav>
      {tab === "replay" && <div className="panel-body"><div className="eyebrow">Published case replay</div><div className="case-list">{cases.map((item) => <button key={item.id} className={selectedId === item.id ? "selected" : ""} onClick={() => setSelectedId(item.id)}><b>{item.id === "hook-1962" ? "The question" : item.id === "replay-srt" ? "The station" : "The hometown"}</b><small>{item.source_note}</small></button>)}</div>{selectedCase?.profile_hometown_provenance && <div className="provenance"><b>Family fact used</b>{selectedCase.profile_hometown_provenance}</div>}{!isHook && <button className="primary" disabled={busy} onClick={() => void execute()}>Run replay <span>→</span></button>}</div>}
      {tab === "words" && <div className="panel-body"><div className="eyebrow">What she is saying now</div><label>One utterance per line<textarea value={wordsText} onChange={(e) => setWordsText(e.target.value)} placeholder={"여기 어디예요?\n친구는 취직했나?"} rows={9}/></label><label>Age band<input value={ageBand} onChange={(e) => setAgeBand(e.target.value)} placeholder="e.g. 80s"/></label><button className="primary" disabled={busy} onClick={() => void execute()}>Where is she? <span>→</span></button></div>}
      {tab === "profile" && <div className="panel-body"><div className="eyebrow">Fill it once</div><p className="intro">Places, routines and eras recalled by her family.</p><label>Family&apos;s words<textarea value={profileText} onChange={(e) => setProfileText(e.target.value)} placeholder="Paste a life story…" rows={10}/></label><Recorder onText={setProfileText} onError={setError}/><button className="primary" disabled={busy} onClick={() => void buildProfile()}>Build profile <span>→</span></button></div>}
    </aside>
    <section className="map-panel">{isHook && !run ? <div className="hook-stage"><div className="eyebrow">Her words · now</div><div className="spoken-lines">{typedWords.map((line, i) => <p key={i}>{line}<i className={i === typedWords.length - 1 && !typingDone ? "cursor" : ""}/></p>)}</div>{typingDone && <button className="primary hook-action" onClick={() => void execute()}>Where is she?</button>}</div> : <><MapView plan={run?.plan} profile={profile ?? run?.profile} decade={decade} reveal={reveal} imagery={imagery} onSelectImagery={setSelectedImagery} present={present}/>{imageryItem && <div className="then-now-overlay"><ThenNow imagery={imageryItem} onClose={() => setSelectedImagery(null)}/><button className="close" onClick={() => setSelectedImagery(null)} aria-label="Close">×</button></div>}{profile && <div className="timeline-card"><div className="era-row">{profile.eras.map((era) => <div key={era.id}><b>{era.label}</b><span>{unknown(era.start_year)}—{unknown(era.end_year)}</span></div>)}</div>{decades.length > 0 && <label>Map decade <b>{decade}s</b><input type="range" min={decades[0]} max={decades.at(-1)} step={10} value={decade ?? decades[0]} onChange={(e) => setDecade(Number(e.target.value))}/></label>}{matchingImagery.map((image) => <button key={image.id} className="secondary" onClick={() => setSelectedImagery(image.id)}>Then / Now · {image.place_label}</button>)}</div>}</>}
      {isHook && run && <div className="hook-result"><div><div className="eyebrow">Ribot reads the remembered time</div><h2>Living in: {run.era.living_in.label}</h2><p>~{unknown(run.era.living_in.approx_year)} · age ~{unknown(run.era.living_in.age)}</p><HighlightedWords words={selectedCase?.her_words ?? []} evidence={run.era.evidence}/></div>{revealReady && !hookRevealed && <button className="primary reveal-button" onClick={() => setHookRevealed(true)}>Reveal</button>}{hookRevealed && <div className="family-reveal"><span>Her son said</span><blockquote>{selectedCase?.family_words?.[0]}</blockquote><a href={selectedCase?.source_url} target="_blank" rel="noreferrer">Read the published account ↗</a></div>}</div>}
    </section><ResultPanel run={isHook ? null : run} reveal={reveal} words={shownWords} busy={busy} error={error} onReveal={() => void doReveal()}/></section>{tab === "replay" && selectedCase && <footer><span>Replays of published cases; not an accuracy claim.</span><a href={selectedCase.source_url} target="_blank" rel="noreferrer">Source ↗</a></footer>}</main>;
}
