import type { ReplayCase, ReplayRun } from "@/lib/contracts";
import HighlightedWords from "./HighlightedWords";

type HookCase = ReplayCase & {
  her_words_en?: string[];
  family_words_en?: string[];
  source_note_en?: string;
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
  const age = ageBand?.split(" (")[0];
  if (sex === "F") return age ? `woman in her ${age}` : "woman";
  if (sex === "M") return age ? `man in his ${age}` : "man";
  return age ? `person in their ${age}` : "person";
}

function knownText(value: string | null | undefined) {
  const text = value?.trim();
  return text && text.toLowerCase() !== "unknown" ? text : null;
}

/** Hook scene: her words type out, Ribot guesses the era, then the family's words are revealed. */
export default function HookStage({ hookCase, typed, typingDone, run, busy, revealReady, revealed, onAsk, onReveal }: Props) {
  const herWords = hookCase.her_words ?? [];
  const herWordsEn = hookCase.her_words_en ?? [];
  const familyWord = knownText(hookCase.family_words?.[0]);
  const familyWordEn = hookCase.family_words_en?.[0] ?? "Translation unavailable.";
  const livingIn = run?.era.living_in;
  const livingInLabel = knownText(livingIn?.label);
  const guessMeta = livingIn
    ? [livingIn.approx_year != null ? `Living in ~${livingIn.approx_year}` : null, livingIn.age != null ? `age ~${livingIn.age}` : null].filter(Boolean)
    : [];

  return (
    <div className="hook-stage">
      <div className="eyebrow demographic-label">Her words · {personDescription(hookCase.age_band, hookCase.sex)}</div>
      {run ? (
        <div className={`hook-comparison ${revealed ? "revealed" : ""}`}>
          <section className="hook-guess">
            <span className="section-label">Ribot&apos;s guess</span>
            {guessMeta.length > 0 && <p className="hook-guess-meta">{guessMeta.join(" · ")}</p>}
            {livingInLabel && <p className="hook-guess-label">{livingInLabel}</p>}
            <HighlightedWords words={herWords} translations={herWordsEn} evidence={run.era.evidence} className="hook-evidence" />
          </section>
          {revealed && familyWord && (
            <section className="family-reveal">
              <span>Her son said</span>
              <blockquote lang="ko"><HighlightElapsed text={familyWord} /></blockquote>
              <p className="quote-subtitle family-subtitle"><HighlightElapsed text={familyWordEn} english /></p>
              <a href={hookCase.source_url} target="_blank" rel="noreferrer">{knownText(hookCase.source_note_en) ?? knownText(hookCase.source_note) ?? "Published source"} ↗</a>
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
