/** Query text for the full-text leg's fallback. Pure. */

/**
 * The words of a websearch-style query that the any-word fallback should look for: excluded terms (`-word`,
 * `-"a phrase"`) and the `or` keyword dropped, quotes removed. Null when nothing is left. Postgres turns the
 * result into lexemes (stemming, stop words), so this only has to undo the websearch syntax.
 */
export function looseQueryText(query: string): string | null {
  const words = query
    .replace(/(^|\s)-"[^"]*"?/g, " ")
    .replace(/(^|\s)-\S+/g, " ")
    .replace(/"/g, " ")
    .split(/\s+/)
    .filter((w) => w && w.toLowerCase() !== "or");
  return words.length ? words.join(" ") : null;
}
