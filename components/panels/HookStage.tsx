import type { ReplayCase, ReplayRun } from "@/lib/contracts";
import HighlightedWords from "./HighlightedWords";

type HookCase = ReplayCase & {
  her_words_en?: string[];
  family_words_en?: string[];
};

type Props = {
  hookCase: HookCase;
  typed: string[];
  typingDone: boolean;
  run: ReplayRun | null;
  busy: boolean;
  revealReady: boolean;
  revealed: boolean;
  onAsk: () => void;
  onReveal: () => void;
};

function HighlightElapsed({ text, english = false }: { text: string; english?: boolean }) {
  const pattern = english ? /\b\d+\s+years?\s+ago\b/i : /\d+년\s*전/;
  const match = text.match(pattern);
  if (!match || match.index == null) return text;
  return <>{text.slice(0, match.index)}<mark>{match[0]}</mark>{text.slice(match.index + match[0].length)}</>;
}

function personDescription(ageBand: string | null | undefined, sex: string | null | undefined) {
  const age = ageBand?.split(" (")[0] ?? "unknown age";
  if (sex === "F") return `woman in her ${age}`;
  if (sex === "M") return `man in his ${age}`;
  return `person in their ${age}`;
}

/** Hook scene: her words type out, Ribot guesses the era, then the family's words are revealed. */
export default function HookStage({ hookCase, typed, typingDone, run, busy, revealReady, revealed, onAsk, onReveal }: Props) {
  const herWords = hookCase.her_words ?? [];
  const herWordsEn = hookCase.her_words_en ?? [];
  const familyWord = hookCase.family_words?.[0] ?? "unknown";
  const familyWordEn = hookCase.family_words_en?.[0] ?? "Translation unavailable.";

  return (
    <div className="hook-stage">
      <div className="eyebrow demographic-label">Her words · {personDescription(hookCase.age_band, hookCase.sex)}</div>
      {run ? (
        <div className={`hook-comparison ${revealed ? "revealed" : ""}`}>
          <section className="hook-guess">
            <span className="section-label">Ribot&apos;s guess</span>
            <p className="hook-guess-meta">
              <span className="hook-guess-unit">Living in ~{run.era.living_in.approx_year ?? "unknown"}</span>{" "}
              <span className="hook-guess-unit">· age ~{run.era.living_in.age ?? "unknown"}</span>
            </p>
            <p className="hook-guess-label">{run.era.living_in.label}</p>
            <HighlightedWords words={herWords} translations={herWordsEn} evidence={run.era.evidence} className="hook-evidence" />
          </section>
          {revealed && (
            <section className="family-reveal">
              <span>Her son said</span>
              <blockquote lang="ko"><HighlightElapsed text={familyWord} /></blockquote>
              <p className="quote-subtitle family-subtitle"><HighlightElapsed text={familyWordEn} english /></p>
              <a href={hookCase.source_url} target="_blank" rel="noreferrer">{hookCase.source_note} ↗</a>
            </section>
          )}
        </div>
      ) : (
        <div className="spoken-lines hook-words">
          {typed.map((line, i) => (
            <div className="spoken-line" key={`${herWords[i] ?? "line"}-${i}`}>
              <p lang="ko">
                {line}
                {i === typed.length - 1 && !typingDone && <i className="cursor" />}
              </p>
              {herWordsEn[i] && <p className="quote-subtitle">{herWordsEn[i]}</p>}
            </div>
          ))}
        </div>
      )}
      <div className="hook-actions">
        {!run && typingDone && (
          <button className="primary hook-action" disabled={busy} onClick={onAsk}>
            {busy ? "Reading her words…" : "Where is she?"}
          </button>
        )}
        {run && revealReady && !revealed && <button className="primary hook-action" onClick={onReveal}>Reveal</button>}
      </div>
    </div>
  );
}
