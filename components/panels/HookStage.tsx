import type { ReplayCase, ReplayRun } from "@/lib/contracts";
import HighlightedWords from "./HighlightedWords";

type Props = {
  hookCase: ReplayCase;
  typed: string[];
  typingDone: boolean;
  run: ReplayRun | null;
  busy: boolean;
  revealReady: boolean;
  revealed: boolean;
  onAsk: () => void;
  onReveal: () => void;
};

/** Hook scene: her words type out, Ribot guesses the era, then the family's words are revealed. */
export default function HookStage({ hookCase, typed, typingDone, run, busy, revealReady, revealed, onAsk, onReveal }: Props) {
  return (
    <div className="hook-stage">
      <div className="eyebrow">Her words · {hookCase.age_band ?? "age unknown"}</div>
      {run ? (
        <HighlightedWords words={hookCase.her_words ?? []} evidence={run.era.evidence} className="hook-words" />
      ) : (
        <div className="spoken-lines hook-words">
          {typed.map((line, i) => (
            <p key={i}>
              {line}
              {i === typed.length - 1 && !typingDone && <i className="cursor" />}
            </p>
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
        {revealed && (
          <div className="family-reveal">
            <span>Her son said</span>
            <blockquote lang="ko">{hookCase.family_words?.[0] ?? "unknown"}</blockquote>
            <a href={hookCase.source_url} target="_blank" rel="noreferrer">{hookCase.source_note} ↗</a>
          </div>
        )}
      </div>
    </div>
  );
}
