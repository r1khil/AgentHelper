"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtChangeBp, fmtChangePct, fmtCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TeamRowData } from "./types";
import { ReadAs, tickerName } from "@/components/app/read-as";
import { RowLink } from "@/components/app/row-link";

/** The contribution bars run to ±40 bp, or to the biggest team when one moved more. */
const SCALE_BP = 40;

const bps = (x: number) => Math.round(x * 10_000);
const tone = (v: number | null | undefined) => (v === null || v === undefined || Math.abs(v) < 1e-9 ? "text-muted-foreground" : v > 0 ? "text-up" : "text-down");

// Below xl (a 1,045 px window leaves this column ~480 px) the team name, return and contribution keep their columns;
// the bar, which only draws the contribution beside it, yields first, and the biggest mover moves to a second line
// under the team name. The mover column stays in the table for screen readers.
const COLS_BOOK = "grid-cols-[minmax(0,1fr)_68px_84px] xl:grid-cols-[minmax(0,1fr)_76px_84px_160px_132px]";
const COLS_PLAIN = "grid-cols-[minmax(0,1fr)_160px]";
// A team's holdings: below xl, narrower number tracks and the company on a line of its own under the ticker.
const HOLDING_COLS = "grid grid-cols-[minmax(0,1fr)_72px_60px_64px_88px] items-center gap-2 xl:grid-cols-[minmax(0,1fr)_96px_80px_80px_104px] xl:gap-3";

/**
 * Teams on the last session: return, what each added to the fund, a diverging bar (xl and up) and the biggest mover. Readers
 * without the book see their teams and today's biggest mover. A row opens to its holdings: price, today's move,
 * move against the S&P 500 and next earnings. For screen readers it is a table: each team is a row group whose first
 * cell holds the expand button (stretched over the row, so the whole row still clicks), and an open team adds a row
 * with one spanning cell holding its holdings table.
 */
export function TeamsPanel({
  title,
  teams,
  withBook,
  live,
  holdingsHref,
}: {
  title: string;
  teams: TeamRowData[];
  /** Show return and contribution columns (the reader may see this book's P&L). */
  withBook: boolean;
  /** False while quotes are still loading. */
  live: boolean;
  holdingsHref: string;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const scale = Math.max(SCALE_BP, ...teams.map((t) => (t.stats ? Math.abs(bps(t.stats.contribution)) : 0)));
  const cols = withBook ? COLS_BOOK : COLS_PLAIN;
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section data-tour="today-teams" aria-label={title}>
      <div className="flex items-baseline justify-between border-b pb-1.5">
        <h2 className="text-body font-bold">{title}</h2>
        <Link href={holdingsHref} className="text-caption text-ink-2 hover:text-foreground">
          Holdings
        </Link>
      </div>
      <div role="table" aria-label={title} className="flex flex-col">
        <div role="rowgroup">
          <div role="row" className={cn("grid h-8 shrink-0 items-center gap-3 px-4 text-body text-muted-foreground", cols)}>
            <span role="columnheader">Team</span>
            {withBook && (
              <>
                <span role="columnheader" className="text-right"><ReadAs text="Return, last session">Return</ReadAs></span>
                <span role="columnheader" className="text-right"><ReadAs text="Contribution to the Fund's return, basis points">To the Fund</ReadAs></span>
                {/* The bar draws the column before it, so it stays out of the table screen readers hear. */}
                <span aria-hidden className="hidden text-center xl:block">Contribution</span>
              </>
            )}
            <span role="columnheader" className={cn(withBook && "sr-only xl:not-sr-only")}>{withBook ? "Biggest mover" : "Biggest mover today"}</span>
          </div>
        </div>
        {teams.map((t) => {
          const isOpen = open.has(t.id);
          const c = t.stats ? bps(t.stats.contribution) : null;
          return (
            <div key={t.id} role="rowgroup" className="flex flex-col border-t border-row">
              <div
                role="row"
                className={cn("group relative grid min-h-[52px] w-full items-center gap-3 px-4 py-1.5 text-left text-body hover:bg-band has-[button:focus-visible]:bg-band", cols)}
              >
                <span role="rowheader" className="min-w-0">
                  <button
                    type="button"
                    onClick={() => toggle(t.id)}
                    aria-expanded={isOpen}
                    className="flex w-full min-w-0 flex-col items-start text-left after:absolute after:inset-0 focus-visible:outline-none"
                  >
                    {/* Inline, so a long name wraps with its count and chevron following the last word. */}
                    <span className="max-w-full">
                      <span className="font-semibold">{t.name}</span>
                      {/* The count and chevron stay together. */}
                      <span className="ml-2 text-body whitespace-nowrap text-muted-foreground">
                        {t.holdings.length}
                        <span className="sr-only"> holding{t.holdings.length === 1 ? "" : "s"}</span>
                        <ChevronRight
                          aria-hidden
                          className={cn(
                            "ml-1.5 inline size-3.5 align-[-2px] transition-[transform,opacity]",
                            isOpen ? "rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100 group-has-[button:focus-visible]:opacity-100",
                          )}
                        />
                      </span>
                    </span>
                    {/* Below xl the biggest mover shows here; its column, which screen readers read, is out of sight. */}
                    {withBook && t.mover && (
                      <span aria-hidden className="text-caption text-muted-foreground xl:hidden">
                        Biggest mover <span className="text-ink-2">{t.mover.ticker} {fmtChangePct(t.mover.pct)}</span>
                      </span>
                    )}
                  </button>
                </span>
                {withBook && (
                  <>
                    <span role="cell" className={cn("text-right text-body font-medium tabular-nums", tone(t.stats?.ret))}>{t.stats ? fmtChangePct(t.stats.ret * 100) : "—"}</span>
                    <span role="cell" className={cn("text-right text-body tabular-nums", tone(c))}>{c === null ? "—" : fmtChangeBp(c)}</span>
                    <ContributionBar bp={c} scale={scale} />
                  </>
                )}
                <span role="cell" className={cn("truncate text-body text-ink-2", withBook && "sr-only xl:not-sr-only")}>
                  {t.mover ? `${t.mover.ticker} ${fmtChangePct(t.mover.pct)}` : live || withBook ? "—" : <Skeleton className="h-4 w-24" />}
                </span>
              </div>
              {isOpen && (
                <div role="row">
                  <div role="cell" aria-colspan={withBook ? 4 : 2}>
                    <TeamHoldings team={t} live={live} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** A centered axis with the team's contribution drawn right (green) or left (vermilion). */
function ContributionBar({ bp, scale }: { bp: number | null; scale: number }) {
  const w = bp ? Math.max(2, (Math.abs(bp) / scale) * 50) : 0;
  return (
    <div className="relative hidden h-2.5 xl:block" aria-hidden>
      <span className="absolute -top-1 -bottom-1 left-1/2 w-px bg-border-strong" />
      {bp ? <span className={cn("absolute inset-y-0 rounded-[3px]", bp > 0 ? "bg-up" : "bg-down")} style={{ left: bp > 0 ? "50%" : `calc(50% - ${w}%)`, width: `${w}%` }} /> : null}
    </div>
  );
}

function TeamHoldings({ team, live }: { team: TeamRowData; live: boolean }) {
  if (team.holdings.length === 0) return <p className="px-4 pb-3 pl-8 text-body text-muted-foreground">No active holdings.</p>;
  return (
    <div className="px-4 pb-3 pl-8">
      <div role="table" aria-label={`${team.name} holdings`} className="text-body">
        <div role="row" className={cn(HOLDING_COLS, "h-7 text-body whitespace-nowrap text-muted-foreground")}>
          <span role="columnheader">Holding</span>
          <span role="columnheader" className="text-right">Price</span>
          <span role="columnheader" className="text-right"><ReadAs text="Day change">Day</ReadAs></span>
          <span role="columnheader" className="text-right"><ReadAs text="Day versus S&P 500, basis points">vs S&amp;P</ReadAs></span>
          <span role="columnheader" className="text-right">Next earnings</span>
        </div>
        {team.holdings.map((h) => (
          <div role="row" key={h.id} className={cn(HOLDING_COLS, "relative min-h-9 border-t border-row py-1 xl:py-0")}>
            <span role="rowheader" className="flex min-w-0 flex-col xl:flex-row xl:items-baseline xl:gap-2">
              <RowLink cover="cell" href={h.href} aria-label={tickerName(h.ticker, h.company)} className="shrink-0 font-semibold hover:underline">
                {h.ticker}
              </RowLink>
              <span aria-hidden className="text-caption text-muted-foreground xl:truncate xl:text-body">
                {h.company}
              </span>
            </span>
            {live ? (
              <>
                <span role="cell" className="text-right tabular-nums">{fmtCurrency(h.price, h.currency)}</span>
                <span role="cell" className={cn("text-right tabular-nums", tone(h.changePct))}>{fmtChangePct(h.changePct)}</span>
                <span role="cell" className="text-right text-muted-foreground tabular-nums">{h.relativePp == null ? "—" : fmtChangeBp(h.relativePp * 100)}</span>
              </>
            ) : (
              <>
                <span role="cell"><Skeleton className="ml-auto h-4 w-16" /></span>
                <span role="cell"><Skeleton className="ml-auto h-4 w-12" /></span>
                <span role="cell"><Skeleton className="ml-auto h-4 w-12" /></span>
              </>
            )}
            <span role="cell" className="text-right text-muted-foreground">{h.nextReport ?? "—"}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-caption text-muted-foreground">Prices are live during market hours.</p>
    </div>
  );
}
