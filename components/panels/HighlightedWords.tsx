import type { EraEstimate } from "@/lib/contracts";

/** Her words with evidence quotes (verbatim substrings) marked inside each line. */
export default function HighlightedWords({
  words,
  translations = [],
  evidence,
  className = "",
}: {
  words: string[];
  translations?: string[];
  evidence: EraEstimate["evidence"];
  className?: string;
}) {
  const quotes = evidence.map((item) => item.quote).filter(Boolean);
  return (
    <div className={`spoken-lines ${className}`}>
      {words.map((line, index) => {
        const quote = quotes.find((item) => line.includes(item));
        const at = quote ? line.indexOf(quote) : -1;
        const afterQuote = at >= 0 ? line.slice(at + quote!.length) : "";
        const punctuation = afterQuote.match(/^[.,!?…。！？]+/)?.[0] ?? "";
        return (
          <div className="spoken-line" key={`${line}-${index}`}>
            <p lang="ko">
              {at < 0 ? line : (
                <>
                  {line.slice(0, at)}
                  <mark>{quote}{punctuation}</mark>
                  {line.slice(at + quote!.length + punctuation.length)}
                </>
              )}
            </p>
            {translations[index] && <p className="quote-subtitle">{translations[index]}</p>}
          </div>
        );
      })}
    </div>
  );
}
