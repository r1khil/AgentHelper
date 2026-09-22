/** How many documents and which dates a result spans, so the model notices when old quarters are mixed in. */
export function passageCoverage(passages: { documentId: string; documentDate: string | null }[], latest?: number) {
  if (!passages.length) return undefined;
  const byDoc = new Map(passages.map((p) => [p.documentId, p.documentDate]));
  const dates = [...byDoc.values()].filter((d): d is string => !!d).sort();
  const span = dates.length ? (dates[0] === dates.at(-1) ? `dated ${dates[0]}` : `dated ${dates[0]} to ${dates.at(-1)}`) : "undated";
  const hint = !latest && new Set(dates).size > 1 ? " If the question is about the latest report only, search again with latest: 1 rather than mixing quarters." : "";
  return `${byDoc.size} document${byDoc.size === 1 ? "" : "s"}, ${span}.${hint}`;
}
