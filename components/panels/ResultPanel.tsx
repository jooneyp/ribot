import { useEffect, useRef } from "react";
import numbersData from "@/data/numbers.json";
import type { Candidate, EraImagery, LifeProfile, ReplayRun, RevealMetrics } from "@/lib/contracts";
import HighlightedWords from "./HighlightedWords";
import ProfileSummary from "./ProfileSummary";

export const unknown = (value: string | number | null | undefined) => value ?? "unknown";
const km = (value: number | null | undefined) => (value == null ? "unknown" : `${value.toFixed(1)} km`);
const numberCard = (id: string) => numbersData.numbers.find((card) => card.id === id);
const ROUTINE_NUMBER = numberCard("G14");
const DANGER_NUMBER = numberCard("G15");
const sentenceCase = (value: string) => {
  const words = value.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

type TextReveal = {
  revealed: boolean;
  place: string;
  placeEn: string;
  time: string;
  sourceUrl: string;
  sourceNote: string;
};

function CandidateList({ candidates }: { candidates: Candidate[] }) {
  return (
    <ol className="rank-list layer-rank-list">
      {candidates.map((candidate) => (
        <li key={`${candidate.rank}-${candidate.place_id}`}>
          <b>#{candidate.rank} {candidate.name}</b>
          <span>
            {km(candidate.distance_km_from_last_seen)} from last seen ·{" "}
            <abbr
              title={`era match × reachability × confidence\n${candidate.score_parts.era_match} × ${candidate.score_parts.reachability} × ${candidate.score_parts.confidence}`}
            >
              score {candidate.score.toFixed(2)}
            </abbr>
          </span>
          {candidate.why && <small>{candidate.why}</small>}
        </li>
      ))}
    </ol>
  );
}

type Props = {
  run: ReplayRun | null;
  reveal: RevealMetrics | null;
  profile: LifeProfile | null;
  words: string[];
  wordTranslations: string[];
  showWordEvidence: boolean;
  possessivePronoun: string;
  busy: string | null;
  error: string | null;
  thenNow: EraImagery[];
  textReveal: TextReveal | null;
  onThenNow: (id: string) => void;
  onReveal: () => void;
};

export default function ResultPanel({ run, reveal, profile, words, wordTranslations, showWordEvidence, possessivePronoun, busy, error, thenNow, textReveal, onThenNow, onReveal }: Props) {
  const metricsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!reveal && !textReveal?.revealed) return;
    const frame = window.requestAnimationFrame(() => {
      metricsRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reveal, textReveal?.revealed]);

  if (error)
    return (
      <aside className="results">
        <div className="eyebrow">Could not complete</div>
        <p className="error" role="alert">{error}</p>
      </aside>
    );
  if (busy) return <aside className="results loading" aria-live="polite"><span className="spinner" aria-hidden />{busy}</aside>;
  if (!run && profile) return <aside className="results"><ProfileSummary profile={profile} /></aside>;
  if (!run)
    return (
      <aside className="results empty">
        <p>Choose a replay or enter {possessivePronoun} words.</p>
        <p>Ribot reads which time of life the person is living in, then ranks that era&apos;s places on today&apos;s map.</p>
      </aside>
    );

  const { era, plan } = run;
  const closest = reveal?.candidates.find((c) => c.rank === reveal.nearest_candidate_rank) ?? null;
  const hasKnownTime = era.living_in.approx_year != null || era.living_in.age != null;
  const isSrtCityLevel = run.case_id === "replay-srt" && plan?.last_seen.label.includes("(city-level)");
  const routineCandidates = plan?.candidates.filter((candidate) => candidate.layer === "routine") ?? [];
  const pastCandidates = plan?.candidates.filter((candidate) => candidate.layer !== "routine") ?? [];
  const hazards = plan?.hazards ?? [];
  const checkOrder = plan?.check_order ?? ["routine", "near_danger", "past"];
  const visibleLayers = checkOrder.filter((layer) =>
    layer === "routine" ? routineCandidates.length > 0
      : layer === "near_danger" ? hazards.length > 0
        : pastCandidates.length > 0 || (plan?.send_first.length ?? 0) > 0,
  );
  return (
    <aside className="results" aria-live="polite">
      <div className="eyebrow">Era estimate</div>
      {hasKnownTime && (
        <p className="result-meta">
          {era.living_in.approx_year == null ? "Year unknown" : `~${era.living_in.approx_year}`} · age {era.living_in.age == null ? "unknown" : `~${era.living_in.age}`}
        </p>
      )}
      <h2>Living in: {unknown(era.living_in.label)}</h2>
      {showWordEvidence && words.length > 0 && era.evidence.length > 0 && <HighlightedWords words={words} translations={wordTranslations} evidence={era.evidence} className="result-words" />}
      {era.evidence.length > 0 && (
        <ul className="why-list">
          {era.evidence.map((e) => {
            const wordIndex = words.findIndex((word) => word.includes(e.quote));
            return (
              <li key={e.quote}>
                <q lang="ko">{e.quote}</q>
                {wordIndex >= 0 && wordTranslations[wordIndex] && <span className="quote-subtitle">{wordTranslations[wordIndex]}</span>}
                <span>{e.why}</span>
              </li>
            );
          })}
        </ul>
      )}
      <section className="result-section">
        <span className="section-label">Intent</span>
        <strong className="intent">{sentenceCase(era.intent)}</strong>
      </section>
      {plan && !reveal && !textReveal?.revealed && <button className="primary reveal-button" onClick={onReveal}>Reveal</button>}
      {thenNow.length > 0 && (
        <section className="result-section">
          {thenNow.map((image) => (
            <button key={image.id} className="secondary wide" onClick={() => onThenNow(image.id)}>
              Then / Now · {image.place_label} · {image.then.year}
            </button>
          ))}
        </section>
      )}
      {plan && (
        <>
          <section className="result-section check-layers">
            <span className="section-label">Check first</span>
            {visibleLayers.map((layer) => (
              <div className={`check-layer check-layer-${layer}`} key={layer}>
                {layer === "routine" && (
                  <>
                    <h3>Her routine</h3>
                    {ROUTINE_NUMBER && <a className="layer-subtitle" href={ROUTINE_NUMBER.source_url} target="_blank" rel="noreferrer">{ROUTINE_NUMBER.value} go missing on a usual errand ↗</a>}
                    <CandidateList candidates={routineCandidates} />
                  </>
                )}
                {layer === "near_danger" && (
                  <>
                    <h3>Near danger</h3>
                    {DANGER_NUMBER && <a className="layer-subtitle" href={DANGER_NUMBER.source_url} target="_blank" rel="noreferrer">Deaths happen close to home, by water and in hills ↗</a>}
                    <ul className="hazard-list">
                      {hazards.map((hazard, index) => {
                        const nearestStream = !!textReveal?.revealed && index < 2 && hazard.kind === "water";
                        return (
                          <li className={nearestStream ? "nearest-stream" : ""} key={`${hazard.kind}-${hazard.name}`}>
                            <span className="hazard-icon" aria-hidden>{hazard.kind === "water" ? "💧" : "⛰️"}</span>
                            <b>{hazard.name}</b>
                            <span>{hazard.distance_km.toFixed(1)} km</span>
                            {nearestStream && <em>Nearest stream</em>}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
                {layer === "past" && (
                  <>
                    <h3>Her past</h3>
                    <CandidateList candidates={pastCandidates} />
                    {plan.send_first.length > 0 && (
                      <div className="send-first-compact">
                        <span className="layer-mini-label">Send first</span>
                        {plan.send_first.map((hub) => (
                          <div className="hub" key={hub.name}>
                            <span className="hub-icon" aria-hidden>{hub.kind === "train" ? "🚆" : hub.kind === "bus" ? "🚌" : hub.kind === "subway" ? "🚇" : "📍"}</span>
                            <div><b>{hub.name}</b><small>{unknown(hub.line)} · <em>{hub.label}</em></small></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            <p className="assumption">
              <span>Last seen: {plan.last_seen.label} · radius search {plan.circle.radius_km} km</span>
              <span>{plan.circle.assumption}</span>
            </p>
          </section>
          {!textReveal && (
            <section className="finder">
              <span className="section-label">Finder card</span>
              {plan.finder_card.ko.map((line, i) => (
                <div key={line}>
                  <p lang="ko">{line}</p>
                  <small>{plan.finder_card.en[i] ?? ""}</small>
                </div>
              ))}
            </section>
          )}
        </>
      )}
      {reveal && (
        <section className="metrics" ref={metricsRef}>
          <span className="section-label">Found · {reveal.found.label}</span>
          <p className="metrics-line">
            Found <b>{km(reveal.home_to_found_km)}</b> from home ·{" "}
            <b>{closest ? km(closest.distance_to_found_km) : "unknown"}</b> from Ribot #{unknown(closest?.rank)}
          </p>
          {isSrtCityLevel ? (
            <p><b>Home district unknown — city-level</b></p>
          ) : (
            <p>inside radius search: <b>{reveal.inside_circle == null ? "unknown" : reveal.inside_circle ? "yes" : "no"}</b></p>
          )}
        </section>
      )}
      {textReveal?.revealed && (
        <section className="metrics text-reveal-card" ref={metricsRef}>
          <span className="section-label">Published account</span>
          <p className="text-reveal-time" lang="ko">{textReveal.time}</p>
          <p className="text-reveal-place" lang="ko">{textReveal.place}</p>
          <p className="quote-subtitle">{textReveal.placeEn}</p>
          <a href={textReveal.sourceUrl} target="_blank" rel="noreferrer">Source: {textReveal.sourceNote} ↗</a>
        </section>
      )}
    </aside>
  );
}
