/**
 * Short visible wording with its full wording for screen readers, for a column header or label that abbreviates:
 * `<ReadAs text="Average weight">Avg wt</ReadAs>` shows "Avg wt" and is read "Average weight".
 */
export function ReadAs({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <>
      <span aria-hidden>{children}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}

/** A ticker link's accessible name: "NVDA, NVIDIA Corporation", or just the ticker when the name is missing or the same. */
export function tickerName(ticker: string, name?: string | null) {
  const n = name?.trim();
  return n && n !== ticker ? `${ticker}, ${n}` : ticker;
}
