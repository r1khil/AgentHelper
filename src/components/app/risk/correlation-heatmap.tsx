import { rnum } from "./format";

/** Cell colour: series-1 for positive correlation, the down colour for negative, stronger with magnitude. */
function shade(c: number) {
  const a = Math.round(Math.min(1, Math.abs(c)) * 85);
  return `color-mix(in oklab, ${c >= 0 ? "var(--series-1)" : "var(--down)"} ${a}%, transparent)`;
}

/** Correlation matrix of the largest holdings. Each cell's exact value is in its tooltip and accessible label. */
export function CorrelationHeatmap({ tickers, matrix }: { tickers: string[]; matrix: number[][] }) {
  if (tickers.length < 2) return <div className="text-body text-muted-foreground">Needs at least two modeled holdings.</div>;
  const pairs: { a: string; b: string; c: number }[] = [];
  for (let i = 0; i < tickers.length; i++) for (let j = i + 1; j < tickers.length; j++) pairs.push({ a: tickers[i], b: tickers[j], c: matrix[i][j] });
  const high = pairs.filter((p) => p.c >= 0.8).sort((x, y) => y.c - x.c);
  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-caption" aria-label="Correlation matrix">
          <thead>
            <tr>
              <td />
              {tickers.map((t) => (
                <th key={t} scope="col" className="h-14 w-8 align-bottom font-medium text-muted-foreground">
                  <span className="inline-block origin-bottom-left translate-x-3 -rotate-60 whitespace-nowrap">{t}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tickers.map((row, i) => (
              <tr key={row}>
                <th scope="row" className="pr-1.5 text-right font-medium whitespace-nowrap text-muted-foreground">{row}</th>
                {tickers.map((col, j) => {
                  const c = matrix[i][j];
                  const label = `${row} / ${col}: ${rnum(c)}`;
                  return (
                    <td key={col} title={label} aria-label={label} className="tnum size-8 rounded-sm text-center" style={{ background: i === j ? "var(--muted)" : shade(c), color: c > 0.55 && i !== j ? "var(--background)" : undefined }}>
                      {i === j ? "" : rnum(c, 1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-sm" style={{ background: shade(-0.6) }} />negative</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-sm" style={{ background: shade(0.2) }} />low</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block size-3 rounded-sm" style={{ background: shade(0.9) }} />high</span>
        {high.length > 0 && (
          <span>
            Moves together (≥ 0.8): {high.slice(0, 6).map((p) => `${p.a}–${p.b} ${rnum(p.c)}`).join(", ")}
            {high.length > 6 ? `, +${high.length - 6} more` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
