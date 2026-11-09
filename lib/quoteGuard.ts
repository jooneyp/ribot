// FROZEN (Joe). Evidence quotes that are not verbatim in the source never reach the screen.
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

export function isGrounded(quote: string, source: string): boolean {
  const q = norm(quote);
  return q.length > 0 && norm(source).includes(q);
}

export function keepGrounded<T extends { quote: string }>(items: T[], source: string): T[] {
  return items.filter((i) => isGrounded(i.quote, source));
}
