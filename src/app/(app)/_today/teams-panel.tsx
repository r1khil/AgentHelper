"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { signed } from "@/lib/today";
import { Panel, PanelHeader } from "@/components/app/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TeamRowData } from "./types";

/** The contribution bars run to ±40 bp, or to the biggest team when one moved more. */
const SCALE_BP = 40;

const bps = (x: number) => Math.round(x * 10_000);
const tone = (v: number | null | undefined) => (v === null || v === undefined || Math.abs(v) < 1e-9 ? "text-muted-foreground" : v > 0 ? "text-up" : "text-down");

const COLS_BOOK = "grid-cols-[minmax(0,1fr)_76px_84px_160px_132px]";
const COLS_PLAIN = "grid-cols-[minmax(0,1fr)_160px]";
const HOLDING_COLS = "grid grid-cols-[minmax(0,1fr)_96px_80px_80px_104px_minmax(0,140px)] items-center gap-3";

/**
 * Teams on the last session: return, what each added to the fund, a diverging bar and the biggest mover. Readers
 * without the book see their teams and today's biggest mover. A row opens to its holdings: price, today's move,
 * move against the S&P 500, next earnings and owner.
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
    <Panel data-tour="today-teams" aria-label={title} className="flex-1">
      <PanelHeader
        title={title}
        aside={
          <Link href={holdingsHref} className="text-[13px] font-semibold text-foreground hover:underline">
            Holdings →
          </Link>
        }
      />
      <div className={cn("grid h-8 shrink-0 items-center gap-3 px-4 text-xs text-muted-foreground", cols)}>
        <span>Team</span>
        {withBook && (
          <>
            <span className="text-right">Return</span>
            <span className="text-right">To the Fund</span>
            <span className="text-center">Contribution</span>
          </>
        )}
        <span>{withBook ? "Biggest mover" : "Biggest mover today"}</span>
      </div>
      {teams.map((t) => {
        const isOpen = open.has(t.id);
        const c = t.stats ? bps(t.stats.contribution) : null;
        return (
          <div key={t.id} className={cn("flex flex-col border-t border-row", isOpen ? "" : "max-h-16 min-h-[52px] flex-1")}>
            <button
              type="button"
              onClick={() => toggle(t.id)}
              aria-expanded={isOpen}
              className={cn("group grid w-full items-center gap-3 px-4 text-left text-[14px] hover:bg-band focus-visible:bg-band focus-visible:outline-none", cols, isOpen ? "h-[52px]" : "flex-1")}
            >
              <span className="flex min-w-0 items-center">
                <span className="truncate font-semibold">{t.name}</span>
                <span className="ml-2 shrink-0 text-[12.5px] text-muted-foreground">{t.holdings.length}</span>
                <ChevronRight
                  aria-hidden
                  className={cn("ml-1.5 size-3.5 shrink-0 text-muted-foreground transition-[transform,opacity]", isOpen ? "rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}
                />
              </span>
              {withBook && (
                <>
                  <span className={cn("text-right font-mono text-[13.5px] font-medium tabular-nums", tone(t.stats?.ret))}>{t.stats ? signed(t.stats.ret * 100, 2, "%") : "—"}</span>
                  <span className={cn("text-right font-mono text-[13.5px] tabular-nums", tone(c))}>{c === null ? "—" : signed(c, 0, " bp")}</span>
                  <ContributionBar bp={c} scale={scale} />
                </>
              )}
              <span className="truncate font-mono text-[12.5px] text-ink-2">
                {t.mover ? `${t.mover.ticker} ${signed(t.mover.pct, 2, "%")}` : live || withBook ? "—" : <Skeleton className="h-4 w-24" />}
              </span>
            </button>
            {isOpen && <TeamHoldings team={t} live={live} />}
          </div>
        );
      })}
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
          <span role="columnheader" className="text-right">Day</span>
          <span role="columnheader" className="text-right">vs S&amp;P</span>
          <span role="columnheader" className="text-right">Next earnings</span>
          <span role="columnheader">Owner</span>
        </div>
        {team.holdings.map((h) => (
          <div role="row" key={h.id} className={cn(HOLDING_COLS, "h-9 border-t border-row")}>
            <span role="cell">
              <Link href={h.href} className="font-mono font-semibold hover:underline">
                {h.ticker}
              </Link>
            </span>
            {live ? (
              <>
                <span role="cell" className="text-right font-mono tabular-nums">{h.price === null ? "—" : `$${fmtMoney(h.price)}`}</span>
                <span role="cell" className={cn("text-right font-mono tabular-nums", tone(h.changePct))}>{signed(h.changePct, 2, "%")}</span>
                <span role="cell" className="text-right font-mono text-muted-foreground tabular-nums">{signed(h.relativePp, 2, " pp")}</span>
              </>
            ) : (
              <>
                <span role="cell"><Skeleton className="ml-auto h-4 w-16" /></span>
                <span role="cell"><Skeleton className="ml-auto h-4 w-12" /></span>
                <span role="cell"><Skeleton className="ml-auto h-4 w-12" /></span>
              </>
            )}
            <span role="cell" className="text-right font-mono text-muted-foreground">{h.nextReport ?? "—"}</span>
            <span role="cell" className="truncate text-muted-foreground">{h.owner ?? "Unassigned"}</span>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">Prices are live during market hours.</p>
    </div>
  );
}
