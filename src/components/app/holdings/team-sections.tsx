import { DateTime } from "luxon";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHero } from "@/components/app/page-head";
import { toneOfText } from "@/components/app/portfolio/figures";
import type { MarketSnapshot } from "@/lib/market";
import { NY } from "@/lib/providers/calendar";
import { fmtBp, fmtChangePair, fmtChangePct, fmtChangeUsd, fmtDay, fmtTime, fmtUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MarketLine } from "./holdings-toolbar";
import { teamDay, type HoldingListRow } from "./holdings-table";

/** The header's grey note: which prices these are. */
export async function TeamAsOf({ market }: { market: Promise<MarketSnapshot> }) {
  const { spx } = await market;
  if (!spx) return <>Quotes unavailable</>;
  const live = spx.marketState === "REGULAR";
  return <>{live ? "Prices as of" : "Closing prices,"} {live ? fmtTime(spx.asOf) : fmtDay(spx.asOf.slice(0, 10))}</>;
}

/** "Prices as of 2:41 PM ET" is the S&P quote's own time; the day word for its line under the table. */
export async function LiveMarketLine({ market, today }: { market: Promise<MarketSnapshot>; today: string }) {
  const { spx, error } = await market;
  if (!spx) return <MarketLine error={error} />;
  const asOf = DateTime.fromISO(spx.asOf).setZone(NY);
  const day = !asOf.isValid || asOf.toISODate() === today ? "today" : asOf.toFormat("cccc");
  return <MarketLine changePct={spx.changePct} day={day} closed={!!spx.marketState && spx.marketState !== "REGULAR"} />;
}

export type TeamHeroInput = {
  /** The line above the figure: the team, how many holdings and, for those who see sizes, its share of the fund. */
  label: string;
  teamName: string;
  rows: HoldingListRow[];
  /** Whether the reader sees position sizes and value: the team's leads, execs and admins. */
  book: boolean;
  /** How the team has done against its sectors since the ledger opened, in bp, and what the sectors are called. */
  sinceBp: { bp: number; label: string; from: string } | null;
};

/**
 * The team's value (its leads, execs and admins) or, for everyone else, its move today, then what that means against
 * the S&P 500. The quotes stream in; until they do the figure is a bone.
 */
export async function TeamHero({ input, market }: { input: TeamHeroInput; market: Promise<MarketSnapshot> }) {
  const { rows, book, teamName, sinceBp, label } = input;
  const snap = await market;
  const spxPct = snap.spx?.changePct;
  const priced = rows.filter((r) => snap.rows[r.ticker]?.quote && r.shares != null && r.shares > 0);
  let value = 0;
  let dayPnl = 0;
  for (const r of priced) {
    const q = snap.rows[r.ticker].quote!;
    const shares = r.shares!;
    const prev = q.previousClose ?? (q.changePct != null ? q.price / (1 + q.changePct / 100) : q.price);
    value += shares * q.price;
    dayPnl += shares * (q.price - prev);
  }
  const quotes = Object.fromEntries(Object.entries(snap.rows).map(([t, m]) => [t, { changePct: m.quote?.changePct }]));
  const dayPct = book && value - dayPnl > 0 ? (dayPnl / (value - dayPnl)) * 100 : teamDay(rows, quotes);
  const vsSpx = dayPct != null && spxPct != null ? (dayPct - spxPct) * 100 : null;
  const missing = rows.length - priced.length;
  const vsText = vsSpx == null ? null : Math.round(Math.abs(vsSpx)) === 0 ? "level with the S&P 500" : `${fmtBp(Math.round(Math.abs(vsSpx)))} ${vsSpx > 0 ? "ahead of" : "behind"} the S&P 500`;
  const sinceText = sinceBp ? `${fmtBp(Math.round(Math.abs(sinceBp.bp)))} ${sinceBp.bp >= 0 ? "ahead of" : "behind"} ${sinceBp.label} since ${fmtDay(sinceBp.from)}` : null;
  const change = book && priced.length ? fmtChangePair(fmtChangeUsd(dayPnl, 0), dayPct) : dayPct != null ? fmtChangePct(dayPct) : null;
  return (
    <>
      <PageHero
        label={label}
        value={book ? (priced.length ? fmtUsd(value, 0) : "—") : dayPct != null ? fmtChangePct(dayPct) : "—"}
        change={book && change ? change : undefined}
        tone={book && change ? toneOfText(change) : null}
        note={`${book ? "Today" : `${teamName} today`}${vsText ? ` · ${vsText}` : ""}${sinceText ? ` · ${sinceText}` : ""}`}
      />
      {missing > 0 && priced.length > 0 && book && <span className="pt-1 text-caption text-caution-foreground">No quote yet for {missing} of {rows.length} holdings, so they are left out of the value.</span>}
      {!snap.spx && <span className="pt-1 text-caption text-caution-foreground">{snap.error ?? "Quotes are unavailable right now."}</span>}
    </>
  );
}

export function TeamHeroFallback({ label, book }: { label: string; book: boolean }) {
  return (
    <PageHero
      label={label}
      value={
        <span aria-hidden className="flex h-[52px] items-center">
          <Skeleton className={cn("h-9", book ? "w-56" : "w-32")} />
        </span>
      }
      note={<Skeleton className="mt-1.5 h-3.5 w-96" />}
    />
  );
}
