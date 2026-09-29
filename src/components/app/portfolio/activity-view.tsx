"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FilterChip, FilterChips } from "@/components/app/panel";
import { VoidMenu } from "@/components/app/attribution/void-menu";
import { voidCashFlow, voidTrade } from "@/lib/actions/ledger";
import { ENTRY_FILTERS, type ActivityDay, type ActivityEntry, type ActivitySummary, type EntryFilter } from "@/lib/portfolio/activity";
import { fmtChangeMoney, fmtDay, fmtDayMonth, fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Delta } from "./figures";

const MATCH: Record<EntryFilter, ActivityEntry["type"] | null> = { All: null, Trades: "trades", Cash: "cash", Dividends: "dividends" };
const GRID = "grid grid-cols-[36px_minmax(0,1fr)_140px_150px] items-center gap-3.5";

function Badge({ letter, voided }: { letter: string; voided: boolean }) {
  return (
    <span aria-hidden className={cn("grid size-8 place-items-center rounded-full bg-secondary text-caption font-bold", voided && "text-muted-foreground")}>
      {letter}
    </span>
  );
}

function Entry({ e, nested }: { e: ActivityEntry; nested?: boolean }) {
  const [open, setOpen] = useState(false);
  const struck = e.voided ? "line-through" : undefined;
  return (
    <li className="border-b border-row">
      <div className={cn(GRID, "min-h-14", nested && "min-h-12")}>
        <Badge letter={e.letter} voided={e.voided} />
        <span className={cn("flex min-w-0 flex-col", e.voided && "text-muted-foreground")}>
          {e.lines ? (
            <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-fit items-center gap-1.5 rounded-sm text-left text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <span className={struck}>{e.title}</span>
              <ChevronDown aria-hidden className={cn("size-3 text-muted-foreground transition-transform", !open && "-rotate-90")} />
            </button>
          ) : (
            <span className={cn("truncate text-body font-semibold", struck)}>{e.title}</span>
          )}
          <span className="truncate text-caption text-muted-foreground">{e.meta}</span>
        </span>
        <span className={cn("text-right text-body font-semibold", struck, e.voided && "text-muted-foreground")}>
          {e.amount === null ? null : e.voided || e.tone === null ? <span className={e.amount === "Reinvested" ? "font-normal text-muted-foreground" : undefined}>{e.amount}</span> : <Delta text={e.amount} />}
        </span>
        <span className="flex items-center justify-end gap-1 text-caption text-muted-foreground">
          {e.voided ? "Voided" : "Recorded"}
          {/* Every row keeps the menu's slot, so the status words line up. */}
          <span className="flex size-7 shrink-0 items-center justify-center">
            {e.voidable && <VoidMenu id={e.voidable.id} entry={e.voidable.entry} action={e.voidable.table === "trade" ? voidTrade : voidCashFlow} />}
          </span>
        </span>
      </div>
      {e.lines && open && (
        <ul className="ml-[50px] mb-2 border-t border-row">
          {e.lines.map((l) => (
            <Entry key={l.id} e={l} nested />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The ledger's history, grouped by day: a letter badge for the kind of entry, what happened and who recorded it, the
 * amount and the status word. Voided entries stay, struck through. `toolbar` holds the dialogs that add to it.
 */
export function ActivityView({ days, summary, toolbar, position }: { days: ActivityDay[]; summary: ActivitySummary; toolbar: React.ReactNode; position?: React.ReactNode }) {
  const [filter, setFilter] = useState<EntryFilter>("All");
  const want = MATCH[filter];
  const shown = days.map((d) => ({ ...d, entries: d.entries.filter((e) => !want || e.type === want) })).filter((d) => d.entries.length);
  const stat = "text-foreground font-semibold";
  return (
    <section aria-labelledby="history-h" className="flex flex-col">
      <div className="mt-[34px] flex flex-wrap items-center gap-1">
        <h2 id="history-h" className="mr-3 text-title font-bold tracking-[-0.01em]">
          History
        </h2>
        <FilterChips label="Filter the history">
          {ENTRY_FILTERS.map((f) => (
            <FilterChip key={f} active={f === filter} onClick={() => setFilter(f)}>
              {f}
            </FilterChip>
          ))}
        </FilterChips>
        <span className="flex-1" />
        <div className="flex items-center gap-2">{toolbar}</div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-[22px] gap-y-1.5 text-caption text-muted-foreground">
        {summary.since && <span>Since {fmtDayMonth(summary.since)}</span>}
        <span>
          <b className={stat}>{summary.trades}</b> {summary.trades === 1 ? "trade" : "trades"} recorded
        </span>
        <span>
          Bought <Delta text={fmtMoney(-summary.bought)} />
        </span>
        <span>
          Sold <Delta text={fmtChangeMoney(summary.sold)} />
        </span>
        <span>
          Net deposits <b className={stat}>{fmtChangeMoney(summary.deposits)}</b>
        </span>
        <span>
          <b className={stat}>{summary.dividends}</b> {summary.dividends === 1 ? "dividend" : "dividends"} reinvested
        </span>
      </div>
      {position && <div className="mt-1.5 text-caption text-muted-foreground">{position}</div>}

      {shown.length === 0 ? (
        <p className="pt-6 text-body text-muted-foreground">{days.length === 0 ? "Nothing is recorded yet. Record a trade, upload its ticket, or import a CSV of past trades and cash. Positions, weights and returns are derived from this list." : `No ${filter.toLowerCase()} entries.`}</p>
      ) : (
        shown.map((d) => (
          <div key={d.date}>
            <h3 className="border-b pt-[18px] pb-1.5 text-caption font-semibold text-muted-foreground">{fmtDay(d.date)}</h3>
            <ul>
              {d.entries.map((e) => (
                <Entry key={e.id} e={e} />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
