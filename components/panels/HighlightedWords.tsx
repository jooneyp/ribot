import type { EraEstimate } from "@/lib/contracts";

/** Her words with evidence quotes (verbatim substrings) marked inside each line. */
export default function HighlightedWords({ words, evidence, className = "" }: { words: string[]; evidence: EraEstimate["evidence"]; className?: string }) {
  const quotes = evidence.map((item) => item.quote).filter(Boolean);
  return (
    <div className={`spoken-lines ${className}`}>
      {words.map((line, index) => {
        const quote = quotes.find((item) => line.includes(item));
        if (!quote) return <p key={index}>{line}</p>;
        const at = line.indexOf(quote);
        return (
          <p key={index}>
            {line.slice(0, at)}
            <mark>{quote}</mark>
            {line.slice(at + quote.length)}
          </p>
        );
      })}
    </div>
  );
}
