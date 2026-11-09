import type { EraImagery, LifeProfile, ReplayRun, RevealMetrics } from "@/lib/contracts";
import HighlightedWords from "./HighlightedWords";
import ProfileSummary from "./ProfileSummary";

export const unknown = (value: string | number | null | undefined) => value ?? "unknown";
const km = (value: number | null | undefined) => (value == null ? "unknown" : `${value.toFixed(1)} km`);

type Props = {
  run: ReplayRun | null;
  reveal: RevealMetrics | null;
  profile: LifeProfile | null;
  words: string[];
  busy: string | null;
  error: string | null;
  thenNow: EraImagery[];
  onThenNow: (id: string) => void;
  onReveal: () => void;
};

export default function ResultPanel({ run, reveal, profile, words, busy, error, thenNow, onThenNow, onReveal }: Props) {
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
        <span>01</span>
        <p>Choose a replay or enter her words.</p>
        <span>02</span>
        <p>Ribot reads which time of her life she is living in, then ranks that era&apos;s places on today&apos;s map.</p>
      </aside>
    );

  const { era, plan } = run;
  const closest = reveal?.candidates.find((c) => c.rank === reveal.nearest_candidate_rank) ?? null;
  return (
    <aside className="results" aria-live="polite">
      <div className="eyebrow">Era estimate</div>
      <h2>Living in: {unknown(era.living_in.label)}</h2>
      <p className="result-meta">
        ~{unknown(era.living_in.approx_year)} · age ~{unknown(era.living_in.age)}
      </p>
      {words.length > 0 && era.evidence.length > 0 && <HighlightedWords words={words} evidence={era.evidence} className="result-words" />}
      {era.evidence.length > 0 && (
        <ul className="why-list">
          {era.evidence.map((e) => (
            <li key={e.quote}><q lang="ko">{e.quote}</q> {e.why}</li>
          ))}
        </ul>
      )}
      <section className="result-section">
        <span className="section-label">Intent</span>
        <strong className="intent">{era.intent.replaceAll("_", " ")}</strong>
      </section>
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
          <section className="result-section">
            <span className="section-label">Search first</span>
            <ol className="rank-list">
              {plan.candidates.map((c) => (
                <li key={`${c.rank}-${c.place_id}`}>
                  <b>#{c.rank} {c.name}</b>
                  <span>
                    {km(c.distance_km_from_last_seen)} from last seen ·{" "}
                    <abbr
                      title={`era match × reachability × confidence\n${c.score_parts.era_match} × ${c.score_parts.reachability} × ${c.score_parts.confidence}`}
                    >
                      score {c.score.toFixed(2)}
                    </abbr>
                  </span>
                  {c.why && <small>{c.why}</small>}
                </li>
              ))}
              {plan.candidates.length === 0 && <li><span>No candidate places found.</span></li>}
            </ol>
            <p className="assumption">
              Last seen: {plan.last_seen.label} · radius search {plan.circle.radius_km} km ({plan.circle.assumption})
            </p>
          </section>
          {plan.send_first.length > 0 && (
            <section className="result-section">
              <span className="section-label">Send first</span>
              {plan.send_first.map((hub) => (
                <div className="hub" key={hub.name}>
                  <span className="hub-icon" aria-hidden>{hub.kind === "train" ? "🚆" : hub.kind === "bus" ? "🚌" : hub.kind === "subway" ? "🚇" : "📍"}</span>
                  <div>
                    <b>{hub.name}</b>
                    <small>{unknown(hub.line)} · <em>{hub.label}</em></small>
                  </div>
                </div>
              ))}
            </section>
          )}
          <section className="finder">
            <span className="section-label">Finder card</span>
            {plan.finder_card.ko.map((line, i) => (
              <div key={line}>
                <p lang="ko">{line}</p>
                <small>{plan.finder_card.en[i] ?? ""}</small>
              </div>
            ))}
          </section>
          {!reveal && <button className="primary reveal-button" onClick={onReveal}>Reveal</button>}
        </>
      )}
      {reveal && (
        <section className="metrics">
          <span className="section-label">Found · {reveal.found.label}</span>
          <p className="metrics-line">
            Found <b>{km(reveal.home_to_found_km)}</b> from home ·{" "}
            <b>{closest ? km(closest.distance_to_found_km) : "unknown"}</b> from Ribot #{unknown(closest?.rank)}
          </p>
          <p>
            inside radius search: <b>{reveal.inside_circle == null ? "unknown" : reveal.inside_circle ? "yes" : "no"}</b>
          </p>
        </section>
      )}
    </aside>
  );
}
