"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import sampleFamily from "@/data/samples/family_sample.json";
import Recorder from "@/components/Recorder";
import ThenNow from "@/components/map/ThenNow";
import HookStage from "@/components/panels/HookStage";
import ResultPanel, { unknown } from "@/components/panels/ResultPanel";
import { api } from "@/lib/api";
import type { CluesResult, EraImagery, LatLng, LifeProfile, ReplayCase, ReplayRun, RevealMetrics, RoutesResult } from "@/lib/contracts";

const MapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });

type Tab = "replay" | "words" | "profile";
type CaseWithSubtitles = ReplayCase & {
  her_words_en?: string[];
  family_words_en?: string[];
  report_words_en?: string | null;
  before_leaving_words?: string[];
  before_leaving_words_en?: string[];
  phone_words?: string[];
  phone_words_en?: string[];
  phone_words_provenance?: string;
  tower_area_query?: string;
  tower_radius_km?: number;
  tower_note?: string;
  search_note_en?: string;
  reveal_mode?: "text";
  found: ReplayCase["found"] & {
    place_en?: string;
    time?: string;
    distance_from_home_note?: string;
  };
};
const HOOK_ID = "hook-1962";
const SEARCH_MANUAL_RADIUS_KM = 12.6;
const SEARCH_MANUAL_ASSUMPTION = "95% of urban dementia searches end within 12.6 km (Koester, Lost Person Behavior, n=336)";
const CASE_ORDER = ["hook-1962", "replay-srt", "replay-uijeongbu", "replay-bulgwang", "replay-naju"];
const CASE_TITLES: Record<string, string> = {
  "hook-1962": "The question",
  "replay-srt": "The station",
  "replay-bulgwang": "The rice paddy",
  "replay-naju": "The hometown",
  "replay-uijeongbu": "Near home",
};
const IMAGERY_YEARS = 15;
const IMAGERY_NEAR_KM = 15;

const message = (e: unknown, fallback: string) => {
  if (!(e instanceof Error)) return fallback;
  const status = e.message.match(/\b([45]\d{2})\b/)?.[1];
  if (status) return `Request failed with status ${status}.`;
  const clean = e.message
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? clean.slice(0, 160) : fallback;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const lines = (text: string) => text.split("\n").map((w) => w.trim()).filter(Boolean);
const approxKm = (a: LatLng, b: LatLng) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 88);
const withCurrentSearchRing = (replay: ReplayRun): ReplayRun => {
  if (!replay.plan || !replay.plan.circle.assumption.includes("3 km/h")) return replay;
  return {
    ...replay,
    plan: {
      ...replay.plan,
      circle: {
        ...replay.plan.circle,
        radius_km: SEARCH_MANUAL_RADIUS_KM,
        assumption: SEARCH_MANUAL_ASSUMPTION,
      },
    },
  };
};
const pronouns = (sex: string | null | undefined) => sex === "M"
  ? { subject: "he", possessive: "his", contraction: "he's" }
  : sex === "F"
    ? { subject: "she", possessive: "her", contraction: "she's" }
    : { subject: "they", possessive: "their", contraction: "they're" };

/** Imagery whose `then.year` ± 15 overlaps the year range and that has a point within ~15 km of its center. */
function imageryNear(imagery: EraImagery[], range: [number | null, number | null], points: LatLng[]) {
  return imagery.filter((image) => {
    const [start, end] = range;
    if (start != null && image.then.year + IMAGERY_YEARS < start) return false;
    if (end != null && image.then.year - IMAGERY_YEARS > end) return false;
    return image.center != null && points.some((p) => approxKm(p, image.center!) < IMAGERY_NEAR_KM);
  });
}

export default function Home() {
  const [present, setPresent] = useState(false);
  const [tour, setTour] = useState(false);
  const [tab, setTab] = useState<Tab>("replay");
  const [cases, setCases] = useState<CaseWithSubtitles[]>([]);
  const [selectedId, setSelectedId] = useState(HOOK_ID);
  const [imagery, setImagery] = useState<EraImagery[]>([]);
  const [run, setRun] = useState<ReplayRun | null>(null);
  const [reveal, setReveal] = useState<RevealMetrics | null>(null);
  const [clues, setClues] = useState<CluesResult | null>(null);
  const [routes, setRoutes] = useState<RoutesResult | null>(null);
  const [elapsedHours, setElapsedHours] = useState(2);
  const [typed, setTyped] = useState<string[]>([]);
  const [typingDone, setTypingDone] = useState(false);
  const [revealReady, setRevealReady] = useState(false);
  const [hookRevealed, setHookRevealed] = useState(false);
  const [textRevealed, setTextRevealed] = useState(false);
  const [wordsText, setWordsText] = useState("");
  const [ageBand, setAgeBand] = useState("");
  const [profileText, setProfileText] = useState("");
  const [lastSeen, setLastSeen] = useState("");
  const [sampleLoaded, setSampleLoaded] = useState(false);
  const [profile, setProfile] = useState<LifeProfile | null>(null);
  const [decade, setDecade] = useState<number | null>(null);
  const [openImagery, setOpenImagery] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedCase = cases.find((c) => c.id === selectedId) ?? null;
  const selectedPronouns = pronouns(selectedCase?.sex);
  const isHook = tab === "replay" && selectedId === HOOK_ID;
  const isTextReveal = tab === "replay" && selectedCase?.reveal_mode === "text";
  const imageryItem = imagery.find((i) => i.id === openImagery) ?? null;

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    setPresent(search.has("present"));
    setTour(search.get("tour") === "1");
    api.cases()
      .then((all) => setCases((all.filter((c) => c.role !== "README only") as CaseWithSubtitles[])
        .toSorted((a, b) => CASE_ORDER.indexOf(a.id) - CASE_ORDER.indexOf(b.id))))
      .catch((e) => setError(message(e, "Could not load cases.")));
    api.imagery().then((list) => setImagery(Array.isArray(list) ? list : [])).catch(() => setImagery([]));
  }, []);

  const resetRun = useCallback(() => {
    setRun(null); setReveal(null); setClues(null); setRoutes(null); setElapsedHours(2); setError(null); setHookRevealed(false); setTextRevealed(false); setRevealReady(false); setOpenImagery(null);
  }, []);

  // Reset on tab/case change.
  useEffect(() => { resetRun(); }, [tab, selectedId, resetRun]);

  // Hook typewriter: ~40 ms/char, 600 ms between lines.
  useEffect(() => {
    const words = isHook ? selectedCase?.her_words : undefined;
    if (!words) { setTyped([]); setTypingDone(true); return; }
    let cancelled = false;
    setTyped([]); setTypingDone(false);
    void (async () => {
      await sleep(600);
      for (const line of words) {
        if (cancelled) return;
        setTyped((old) => [...old, ""]);
        for (let i = 1; i <= line.length; i++) {
          await sleep(40);
          if (cancelled) return;
          setTyped((old) => [...old.slice(0, -1), line.slice(0, i)]);
        }
        await sleep(600);
      }
      if (!cancelled) setTypingDone(true);
    })();
    return () => { cancelled = true; };
  }, [isHook, selectedCase]);

  // Hook Reveal button appears 1 s after the era result.
  useEffect(() => {
    if (!run || !isHook) return;
    const t = window.setTimeout(() => setRevealReady(true), 1000);
    return () => window.clearTimeout(t);
  }, [run, isHook]);

  const runEra = useCallback(async () => {
    resetRun();
    setBusy("Reading her words…");
    try {
      if (tab === "replay") {
        const next = await api.replayRun(selectedId);
        if (!next) throw new Error(`No replay result for ${selectedId}.`);
        setRun(withCurrentSearchRing(next));
      } else {
        const words = lines(wordsText);
        if (!words.length) throw new Error("Enter at least one utterance.");
        const era = await api.era({ words, report_words: null, age_band: ageBand.trim() || null, now_year: new Date().getFullYear() });
        // With a family profile on file, her words drive the full three-layer plan from where she was last seen.
        const where = lastSeen.trim();
        if (profile && where) {
          setBusy("Building the search plan…");
          const plan = await api.plan({ profile, era, last_seen: { label: `${where} (last seen)`, query: where }, elapsed_hours: 1 });
          setRun({ case_id: "her-words", era, profile, plan });
        } else {
          setRun({ case_id: "her-words", era, profile: null, plan: null });
        }
      }
    } catch (e) {
      setError(message(e, "Something went wrong."));
    } finally {
      setBusy(null);
    }
  }, [ageBand, lastSeen, profile, resetRun, selectedId, tab, wordsText]);

  const buildProfile = useCallback(async () => {
    if (!profileText.trim()) { setError("Paste the family's words or choose an audio file."); return; }
    resetRun();
    setBusy("Building the life profile…");
    try {
      const parsed = await api.profile({ text: profileText, display_name: null });
      setBusy("Finding places on today's map…");
      const geocoded = await api.geocodeProfile(parsed);
      setProfile(geocoded);
      const first = geocoded.eras.map((e) => e.start_year).find((y): y is number => y != null);
      setDecade(first == null ? null : Math.floor(first / 10) * 10);
    } catch (e) {
      setError(message(e, "Could not build the profile."));
    } finally {
      setBusy(null);
    }
  }, [profileText, resetRun]);

  useEffect(() => {
    if (!run?.plan) {
      setRoutes(null);
      return;
    }
    let cancelled = false;
    setRoutes(null);
    api.routes(run.plan, elapsedHours)
      .then((result) => { if (!cancelled) setRoutes(result); })
      .catch((e) => { if (!cancelled) setError(message(e, "Could not load walking routes.")); });
    return () => { cancelled = true; };
  }, [elapsedHours, run?.plan]);

  const doReveal = useCallback(async () => {
    if (!run?.plan) return;
    if (isTextReveal) {
      setTextRevealed(true);
      return;
    }
    setBusy("Checking against the published account…");
    try {
      const metrics = await api.reveal(run.case_id, run.plan);
      if (!metrics) throw new Error(`No reveal result for ${run.case_id}.`);
      setReveal(metrics);
    } catch (e) {
      setError(message(e, "Could not reveal the result."));
    } finally {
      setBusy(null);
    }
  }, [isTextReveal, run]);

  const findClues = useCallback(async () => {
    if (!selectedCase?.phone_words?.length || !selectedCase.tower_area_query || selectedCase.tower_radius_km == null) return;
    setBusy("Finding her words on the map…");
    try {
      const result = await api.clues({
        words: selectedCase.phone_words,
        center_query: selectedCase.tower_area_query,
        radius_km: selectedCase.tower_radius_km,
      });
      setClues(result);
    } catch (e) {
      setError(message(e, "Could not find her words on the map."));
    } finally {
      setBusy(null);
    }
  }, [selectedCase]);

  // Present mode: arrows choose a replay; Space advances its current step.
  useEffect(() => {
    if (!present) return;
    const onKey = (event: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) return;
      if ((event.code === "ArrowRight" || event.code === "ArrowLeft") && tab === "replay" && cases.length > 0) {
        event.preventDefault();
        const current = Math.max(0, cases.findIndex((item) => item.id === selectedId));
        const direction = event.code === "ArrowRight" ? 1 : -1;
        const next = (current + direction + cases.length) % cases.length;
        setSelectedId(cases[next].id);
        return;
      }
      if (event.code !== "Space") return;
      event.preventDefault();
      if (busy) return;
      if (isHook) {
        if (!run && typingDone) void runEra();
        else if (run && revealReady && !hookRevealed) setHookRevealed(true);
      } else if (tab === "profile") {
        if (!profile) void buildProfile();
      } else if (!run) void runEra();
      else if (run.plan && selectedCase?.phone_words?.length && !clues) void findClues();
      else if (run.plan && !reveal && !textRevealed) void doReveal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, buildProfile, cases, clues, doReveal, findClues, hookRevealed, isHook, present, profile, reveal, revealReady, run, runEra, selectedCase, selectedId, tab, textRevealed, typingDone]);

  const decades = useMemo(() => {
    const years = profile?.eras.flatMap((e) => [e.start_year, e.end_year]).filter((y): y is number => y != null) ?? [];
    if (!years.length) return [];
    const start = Math.floor(Math.min(...years) / 10) * 10;
    const end = Math.floor(Math.max(...years) / 10) * 10;
    return Array.from({ length: (end - start) / 10 + 1 }, (_, i) => start + i * 10);
  }, [profile]);

  // Then / Now: for the active run (era year range × plan candidates) or the profile (each era × its places).
  const thenNow = useMemo(() => {
    if (run?.plan) {
      const range = run.era.living_in.year_range ?? [null, null];
      return imageryNear(imagery, range, run.plan.candidates.map((c) => c.geo));
    }
    if (!run && profile && tab === "profile") {
      const hits = profile.eras.flatMap((era) =>
        imageryNear(imagery, [era.start_year, era.end_year], era.places.flatMap((p) => (p.geo ? [p.geo] : []))),
      );
      return [...new Map(hits.map((h) => [h.id, h])).values()];
    }
    return [];
  }, [imagery, profile, run, tab]);

  const mapProfile = tab === "profile" ? profile : run?.profile ?? null;
  const shownWords = tab === "words" ? lines(wordsText) : selectedCase?.her_words ?? (selectedCase?.report_words ? [selectedCase.report_words] : []);
  const shownWordsEn = tab === "words"
    ? []
    : selectedCase?.her_words_en ?? (selectedCase?.report_words_en ? [selectedCase.report_words_en] : []);

  return (
    <main className={`app-shell ${present ? "present" : ""} ${present && tab === "replay" && !isHook ? "present-replay" : ""}`}>
      <header className="topbar">
        <div>
          <span className="brand-mark" aria-hidden>R</span>
          <h1>Ribot <span>— Search where {tab === "replay" ? selectedPronouns.contraction : "she's"} from</span></h1>
        </div>
        {!present && <p className="mode">Prototype · family-guided search</p>}
      </header>

      <section className="workspace">
        <aside className="input-panel">
          <nav className="tabs" aria-label="Input mode">
            {(["replay", "words", "profile"] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {t === "words" ? "Her words" : t === "profile" ? "Family profile" : "Replay"}
              </button>
            ))}
          </nav>

          {tab === "replay" && (
            <div className="panel-body">
              <div className="eyebrow">Published case replay</div>
              <div className="case-list">
                {cases.map((c) => (
                  <button key={c.id} className={selectedId === c.id ? "selected" : ""} onClick={() => setSelectedId(c.id)}>
                    <b>{CASE_TITLES[c.id] ?? c.id}</b>
                    <small>{c.source_note}</small>
                  </button>
                ))}
              </div>
              {selectedCase && !isHook && (
                <div className="case-input">
                  <span className="section-label">Input</span>
                  {selectedCase.report_words && (
                    <p>
                      <small>{selectedPronouns.possessive[0].toUpperCase() + selectedPronouns.possessive.slice(1)} family&apos;s report</small>
                      <span lang="ko">“{selectedCase.report_words}”</span>
                      {selectedCase.report_words_en && <span className="quote-subtitle">{selectedCase.report_words_en}</span>}
                    </p>
                  )}
                  {selectedCase.before_leaving_words?.map((word, index) => (
                    <p className="before-leaving-input" key={word}>
                      <small>Before {selectedPronouns.subject} left {selectedPronouns.subject} kept saying</small>
                      <span lang="ko">“{word}”</span>
                      {selectedCase.before_leaving_words_en?.[index] && <span className="quote-subtitle">{selectedCase.before_leaving_words_en[index]}</span>}
                    </p>
                  ))}
                  {selectedCase.search_note_en && (
                    <p className="search-note-input">
                      <small>Search assumption before she was found</small>
                      <span>{selectedCase.search_note_en}</span>
                    </p>
                  )}
                  {!selectedCase.report_words && selectedCase.family_words?.[0] && (
                    <p>
                      <small>{selectedPronouns.possessive[0].toUpperCase() + selectedPronouns.possessive.slice(1)} family said</small>
                      <span lang="ko">“{selectedCase.family_words[0]}”</span>
                      {selectedCase.family_words_en?.[0] && <span className="quote-subtitle">{selectedCase.family_words_en[0]}</span>}
                    </p>
                  )}
                  <p><small>Home</small><span lang="ko">{unknown(selectedCase.home)}</span></p>
                  <p><small>Hometown (family)</small><span lang="ko">{unknown(selectedCase.profile_hometown)}</span></p>
                </div>
              )}
              {selectedCase?.profile_hometown_provenance && (
                <div className="provenance"><b>Ribot already knows</b>{selectedCase.profile_hometown_provenance}</div>
              )}
              {!isHook && (
                <button className="primary" disabled={!!busy} onClick={() => void runEra()}>
                  Run replay <span>→</span>
                </button>
              )}
            </div>
          )}

          {tab === "words" && (
            <div className="panel-body">
              <div className="eyebrow">What she is saying now</div>
              <label>
                One utterance per line
                <textarea value={wordsText} onChange={(e) => setWordsText(e.target.value)} placeholder={"여기 어디예요?\n친구는 취직했나?"} rows={8} lang="ko" />
              </label>
              <label>
                Age band
                <input value={ageBand} onChange={(e) => setAgeBand(e.target.value)} placeholder="e.g. 80s" />
              </label>
              <label>
                Last seen
                <input value={lastSeen} onChange={(e) => setLastSeen(e.target.value)} placeholder="e.g. 서울특별시 은평구 응암동" lang="ko" />
              </label>
              <button className="primary" disabled={!!busy} onClick={() => void runEra()}>
                Where is she? <span>→</span>
              </button>
            </div>
          )}

          {tab === "profile" && (
            <div className="panel-body">
              <div className="eyebrow">Fill it once</div>
              <p className="intro">Her family fills it once: her stories, places, routines, memories with her husband, and the address history from her 주민등록초본 (every registered move, with dates). Typed, pasted, or a phone recording.</p>
              <label>
                Family&apos;s words + address history
                <textarea value={profileText} onChange={(e) => setProfileText(e.target.value)} placeholder={"고향은… 열일곱에 서울 올라와서…\n할아버지랑은 창경원에서 처음 만나셨대요.\n\n[주민등록초본 주소 변동 사항 붙여넣기]\n서울특별시 ○○구 ○○동 …  1976-05-10 전입"} rows={9} lang="ko" />
              </label>
              <Recorder onText={setProfileText} onError={setError} />
              <button
                className="secondary"
                disabled={!!busy}
                onClick={() => {
                  setProfileText(sampleFamily.profile_text);
                  setWordsText(sampleFamily.her_words.join("\n"));
                  setAgeBand(sampleFamily.age_band);
                  setLastSeen(sampleFamily.last_seen);
                  setSampleLoaded(true);
                }}
              >
                Load family profile
              </button>
              <button className="primary" disabled={!!busy} onClick={() => void buildProfile()}>
                Build profile <span>→</span>
              </button>
            </div>
          )}
        </aside>

        <section className="map-panel">
          {isHook && selectedCase ? (
            <HookStage
              hookCase={selectedCase}
              typed={typed}
              typingDone={typingDone}
              run={run}
              busy={!!busy}
              revealReady={revealReady}
              revealed={hookRevealed}
              onAsk={() => void runEra()}
              onReveal={() => setHookRevealed(true)}
            />
          ) : (
            <>
              <MapView
                plan={run?.plan ?? null}
                profile={mapProfile}
                decade={tab === "profile" ? decade : null}
                reveal={reveal}
                clues={clues}
                imagery={imagery}
                onSelectImagery={setOpenImagery}
                present={present}
                routes={routes}
                tour={tour}
              />
              {tab === "profile" && profile && (
                <div className="timeline-card">
                  <div className="era-row">
                    {profile.eras.map((era) => {
                      const active = decade != null && (era.start_year ?? -Infinity) <= decade + 9 && (era.end_year ?? Infinity) >= decade;
                      return (
                        <div key={era.id} className={active ? "active" : ""}>
                          <b>{era.label}</b>
                          <span>{unknown(era.start_year)}–{unknown(era.end_year)}</span>
                        </div>
                      );
                    })}
                  </div>
                  {decades.length > 0 && (
                    <div className="decade-row">
                      <button className={`chip ${decade == null ? "on" : ""}`} onClick={() => setDecade(null)}>All</button>
                      <label>
                        <span>Map decade <b>{decade == null ? "all" : `${decade}s`}</b></span>
                        <input
                          type="range"
                          min={decades[0]}
                          max={decades.at(-1)}
                          step={10}
                          value={decade ?? decades[0]}
                          onChange={(e) => setDecade(Number(e.target.value))}
                          list="decade-ticks"
                        />
                        <datalist id="decade-ticks">{decades.map((d) => <option key={d} value={d} label={`${d}s`} />)}</datalist>
                        <span className="ticks">{decades.map((d) => <i key={d}>{d}s</i>)}</span>
                      </label>
                    </div>
                  )}
                  {thenNow.length > 0 && (
                    <div className="then-now-row">
                      {thenNow.map((image) => (
                        <button key={image.id} className="secondary" onClick={() => setOpenImagery(image.id)}>
                          Then / Now · {image.place_label} · {image.then.year}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {imageryItem && (
                <div className="then-now-overlay">
                  <ThenNow imagery={imageryItem} onClose={() => setOpenImagery(null)} />
                </div>
              )}
            </>
          )}
        </section>

        <ResultPanel
          run={run}
          reveal={reveal}
          profile={tab === "profile" ? profile : null}
          words={shownWords}
          wordTranslations={shownWordsEn}
          showWordEvidence={!isHook}
          possessivePronoun={selectedPronouns.possessive}
          busy={busy}
          error={error}
          thenNow={tab === "profile" ? [] : thenNow}
          onThenNow={setOpenImagery}
          onReveal={() => void doReveal()}
          onFindClues={() => void findClues()}
          clues={clues}
          routes={routes}
          elapsedHours={elapsedHours}
          onElapsedHoursChange={setElapsedHours}
          phoneStep={selectedCase?.phone_words?.length ? {
            words: selectedCase.phone_words,
            translations: selectedCase.phone_words_en ?? [],
            provenance: selectedCase.phone_words_provenance ?? "",
            towerNote: selectedCase.tower_note ?? "",
          } : null}
          sampleLabel={null}
          textReveal={isTextReveal && selectedCase ? {
            revealed: textRevealed,
            place: selectedCase.found.place,
            placeEn: selectedCase.found.place_en ?? "Translation unavailable.",
            time: selectedCase.found.time ?? "unknown",
            distanceNote: selectedCase.found.distance_from_home_note,
            sourceUrl: selectedCase.source_url,
            sourceNote: selectedCase.source_note,
          } : null}
        />
      </section>

      <footer>
        {tab === "replay" && selectedCase ? (
          <>
            <span>Real case, as published.</span>
            <a href={selectedCase.source_url} target="_blank" rel="noreferrer">Source: {selectedCase.source_note} ↗</a>
          </>
        ) : (
          <span>No phone. No GPS. Just her life and her words.</span>
        )}
      </footer>
    </main>
  );
}
