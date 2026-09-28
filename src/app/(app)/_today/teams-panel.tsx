"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Acct } from "@/components/app/accounting";
import { Panel, PanelHeader } from "@/components/app/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtAccounting, fmtCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TeamRowData } from "./types";
import { ReadAs, tickerName } from "@/components/app/read-as";
import { RowLink } from "@/components/app/row-link";

/** The contribution bars run to ±40 bp, or to the biggest team when one moved more. */
const SCALE_BP = 40;

const bps = (x: number) => Math.round(x * 10_000);
const tone = (v: number | null | undefined) => (v === null || v === undefined || Math.abs(v) < 1e-9 ? "text-muted-foreground" : v > 0 ? "text-up" : "text-down");

const COLS_BOOK = "grid-cols-[minmax(0,1fr)_76px_84px_160px_132px]";
const COLS_PLAIN = "grid-cols-[minmax(0,1fr)_160px]";
const HOLDING_COLS = "grid grid-cols-[minmax(0,1fr)_96px_80px_80px_104px] items-center gap-3";

/**
 * Teams on the last session: return, what each added to the fund, a diverging bar and the biggest mover. Readers
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
    <Panel data-tour="today-teams" aria-label={title}>
      <PanelHeader
        title={title}
        aside={
          <Link href={holdingsHref} className="text-[13px] font-semibold text-foreground hover:underline">
            Holdings →
          </Link>
        }
      />
      <div role="table" aria-label={title} className="flex flex-col">
        <div role="rowgroup">
          <div role="row" className={cn("grid h-8 shrink-0 items-center gap-3 px-4 text-xs text-muted-foreground", cols)}>
            <span role="columnheader">Team</span>
            {withBook && (
              <>
                <span role="columnheader" className="text-right"><ReadAs text="Return, last session">Return</ReadAs></span>
                <span role="columnheader" className="text-right"><ReadAs text="Contribution to the Fund's return, basis points">To the Fund</ReadAs></span>
                {/* The bar draws the column before it, so it stays out of the table screen readers hear. */}
                <span aria-hidden className="text-center">Contribution</span>
              </>
            )}
            <span role="columnheader">{withBook ? "Biggest mover" : "Biggest mover today"}</span>
          </div>
        </div>
        {teams.map((t) => {
          const isOpen = open.has(t.id);
          const c = t.stats ? bps(t.stats.contribution) : null;
          return (
            <div key={t.id} role="rowgroup" className="flex flex-col border-t border-row">
              <div
                role="row"
                className={cn("group relative grid w-full items-center gap-3 px-4 text-left text-[14px] hover:bg-band has-[button:focus-visible]:bg-band", cols, "h-[52px]")}
              >
                <span role="rowheader" className="min-w-0">
                  <button
                    type="button"
                    onClick={() => toggle(t.id)}
                    aria-expanded={isOpen}
                    className="flex w-full min-w-0 items-center text-left after:absolute after:inset-0 focus-visible:outline-none"
                  >
                    <span className="truncate font-semibold">{t.name}</span>
                    <span className="ml-2 shrink-0 text-[12.5px] text-muted-foreground">
                      {t.holdings.length}
                      <span className="sr-only"> holding{t.holdings.length === 1 ? "" : "s"}</span>
                    </span>
                    <ChevronRight
                      aria-hidden
                      className={cn(
                        "ml-1.5 size-3.5 shrink-0 text-muted-foreground transition-[transform,opacity]",
                        isOpen ? "rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100 group-has-[button:focus-visible]:opacity-100",
                      )}
                    />
                  </button>
                </span>
                {withBook && (
                  <>
                    <span role="cell" className={cn("text-right font-mono text-[13.5px] font-medium tabular-nums", tone(t.stats?.ret))}>{t.stats ? <Acct value={t.stats.ret * 100} unit="%" /> : "—"}</span>
                    <span role="cell" className={cn("text-right font-mono text-[13.5px] tabular-nums", tone(c))}>{c === null ? "—" : <Acct value={c} digits={0} unit=" bp" />}</span>
                    <ContributionBar bp={c} scale={scale} />
                  </>
                )}
                <span role="cell" className="truncate font-mono text-[12.5px] text-ink-2">
                  {t.mover ? `${t.mover.ticker} ${fmtAccounting(t.mover.pct, 2, "%")}` : live || withBook ? "—" : <Skeleton className="h-4 w-24" />}
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
    </Panel>
  );
}

/** A centered axis with the team's contribution drawn right (green) or left (vermilion). */
function ContributionBar({ bp, scale }: { bp: number | null; scale: number }) {
  const w = bp ? Math.max(2, (Math.abs(bp) / scale) * 50) : 0;
  return (
    <div className="relative h-2.5" aria-hidden>
      <span className="absolute -top-1 -bottom-1 left-1/2 w-px bg-border-strong" />
      {bp ? <span className={cn("absolute inset-y-0 rounded-[3px]", bp > 0 ? "bg-up" : "bg-down")} style={{ left: bp > 0 ? "50%" : `calc(50% - ${w}%)`, width: `${w}%` }} /> : null}
    </div>
  );
}

function TeamHoldings({ team, live }: { team: TeamRowData; live: boolean }) {
  if (team.holdings.length === 0) return <p className="px-4 pb-3 pl-8 text-[13px] text-muted-foreground">No active holdings.</p>;
  return (
    <div className="px-4 pb-3 pl-8">
      <div role="table" aria-label={`${team.name} holdings`} className="text-[13px]">
        <div role="row" className={cn(HOLDING_COLS, "h-7 text-xs text-muted-foreground")}>
          <span role="columnheader">Holding</span>
          <span role="columnheader" className="text-right">Price</span>
          <span role="columnheader" className="text-right"><ReadAs text="Day change">Day</ReadAs></span>
          <span role="columnheader" className="text-right"><ReadAs text="Day versus S&P 500, basis points">vs S&amp;P</ReadAs></span>
          <span role="columnheader" className="text-right">Next earnings</span>
        </div>
        {team.holdings.map((h) => (
          <div role="row" key={h.id} className={cn(HOLDING_COLS, "relative h-9 border-t border-row")}>
            <span role="rowheader" className="flex min-w-0 items-baseline gap-2">
              <RowLink cover="cell" href={h.href} aria-label={tickerName(h.ticker, h.company)} className="shrink-0 font-mono font-semibold hover:underline">
                {h.ticker}
              </RowLink>
              <span aria-hidden className="truncate text-muted-foreground">
                {h.company}
              </span>
            </span>
            {live ? (
              <>
                <span role="cell" className="text-right font-mono tabular-nums">{fmtCurrency(h.price, h.currency)}</span>
                <span role="cell" className={cn("text-right font-mono tabular-nums", tone(h.changePct))}><Acct value={h.changePct} unit="%" /></span>
                <span role="cell" className="text-right font-mono text-muted-foreground tabular-nums"><Acct value={h.relativePp == null ? null : h.relativePp * 100} digits={0} unit=" bp" /></span>
              </>
            ) : (
              <>
                <span role="cell"><Skeleton className="ml-auto h-4 w-16" /></span>
                <span role="cell"><Skeleton className="ml-auto h-4 w-12" /></span>
                <span role="cell"><Skeleton className="ml-auto h-4 w-12" /></span>
              </>
            )}
            <span role="cell" className="text-right font-mono text-muted-foreground">{h.nextReport ?? "—"}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">Prices are live during market hours.</p>
    </div>
  );
}
