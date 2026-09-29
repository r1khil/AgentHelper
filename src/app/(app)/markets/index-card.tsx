import { fmtAccounting, fmtChangeBp, fmtChangePct, fmtPct, fmtTime } from "@/lib/format";
import { getQuotes } from "@/lib/providers/yahoo";
import type { Quote } from "@/lib/providers/types";
import { cn } from "@/lib/utils";
import { RailCard, RailRow } from "./rail";

/** The index levels in the rail. The 10-year is a yield, so its move is in basis points rather than percent. */
const INDICES = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^NDX", label: "Nasdaq 100" },
  { symbol: "^TNX", label: "10-year yield", yield: true },
  { symbol: "^VIX", label: "VIX" },
] as const;

/** Up green, down red, by the figure as written: a move that rounds to zero is neither. */
const tone = (text: string) => (text.startsWith("+") ? "text-up" : text.startsWith("(") ? "text-down" : "text-muted-foreground");

function Level({ q, isYield }: { q: Quote; isYield: boolean }) {
  // Yahoo quotes the 10-year as the yield in percent (4.12), so a point is 100 bp.
  const bp = isYield && q.previousClose !== undefined ? (q.price - q.previousClose) * 100 : null;
  const raw = isYield ? bp : q.changePct;
  const change = raw === null || raw === undefined ? null : isYield ? fmtChangeBp(raw) : fmtChangePct(raw);
  return (
    <span className="flex items-baseline gap-2 tabular-nums">
      <span className="font-semibold text-foreground">{isYield ? fmtPct(q.price, 2) : fmtAccounting(q.price, 2)}</span>
      {change && <span className={cn("w-[62px] text-right text-caption", tone(change))}>{change}</span>}
    </span>
  );
}

/**
 * "Today": the S&P 500, Nasdaq 100, 10-year yield and VIX from the same delayed Yahoo quotes the rest of the app uses
 * (cached a minute). Nothing is shown when the quotes can't be had: no placeholder levels.
 */
export async function IndexCard() {
  const quotes = await getQuotes(INDICES.map((i) => i.symbol)).catch(() => null);
  const rows = INDICES.flatMap((i) => (quotes?.[i.symbol] ? [{ ...i, q: quotes[i.symbol] }] : []));
  if (!rows.length) return null;
  const asOf = rows
    .map((r) => r.q.asOf)
    .sort()
    .at(-1);
  return (
    <RailCard title="Today" id="markets-today" note={asOf ? `Delayed quotes as of ${fmtTime(asOf)}` : undefined}>
      {rows.map((r) => (
        <RailRow key={r.symbol} label={<span className="text-ink-2">{r.label}</span>}>
          <Level q={r.q} isYield={"yield" in r} />
        </RailRow>
      ))}
    </RailCard>
  );
}
