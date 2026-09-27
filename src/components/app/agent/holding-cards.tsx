"use client";

import Link from "next/link";
import { Suspense, use, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDateTime, relativeTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

export type HoldingCardData = {
  id: string;
  ticker: string;
  name: string;
  href: string;
  chats: number;
  sources: number;
  /** ISO time of the latest chat activity. */
  lastActivity: string | null;
  /** Someone's question is still being answered. */
  running?: { authorName: string | null; title: string };
  /** An open movement on this holding: the analyst owes an update. */
  movement?: { dueAt: string | null };
  /** The next scheduled report, when one is on the calendar. */
  earnings?: { reportDate: string; dateStatus: string; hasExpectations: boolean };
};

/** Day move and move versus the S&P 500, per ticker, once quotes arrive. */
export type MarketByTicker = Record<string, { changePct?: number; relativePp?: number }>;

/** Every holding's research board, as a filterable list for the side column of Research › Conversations. */
export function HoldingCards({ holdings, market }: { holdings: HoldingCardData[]; market: Promise<MarketByTicker> }) {
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();
  const shown = holdings.filter((h) => !f || h.ticker.toLowerCase().includes(f) || h.name.toLowerCase().includes(f));
  return (
    <>
      <div className="flex shrink-0 items-baseline">
        <h2 className="flex-1 text-sm font-semibold">Research boards</h2>
        <span className="font-mono text-xs text-muted-foreground">{holdings.length}</span>
      </div>
      <label className="mt-2.5 flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-card px-3 text-muted-foreground shadow-[0_0_0_1px_var(--border)] focus-within:shadow-[0_0_0_1px_var(--ring)]">
        <Search className="size-3.5 shrink-0" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter holdings…"
          aria-label="Filter holdings"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div className="-mx-1 mt-2.5 min-h-0 flex-1 overflow-y-auto px-1 pt-px pb-1">
        {shown.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">No holdings match “{filter.trim()}”.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.map((h) => (
              <li key={h.id}>
                <HoldingCard h={h} market={market} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function HoldingCard({ h, market }: { h: HoldingCardData; market: Promise<MarketByTicker> }) {
  const has = h.chats > 0;
  return (
    <Link
      href={h.href}
      className="block rounded-[10px] bg-card px-3 py-[9px] shadow-[0_0_0_1px_var(--border)] transition-shadow hover:shadow-[0_0_0_1px_var(--border-strong)]"
      title={has ? `Open ${h.ticker}'s research board` : `Ask about ${h.ticker}`}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[12.5px] font-semibold">{h.ticker}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{h.name}</span>
        <Suspense fallback={<Skeleton className="h-3.5 w-12" />}>
          <QuoteCell ticker={h.ticker} market={market} alert={Boolean(h.movement)} />
        </Suspense>
      </div>
      <StatusLine h={h} />
      <div className="mt-0.5 text-[11.5px] text-muted-foreground">
        {has ? (
          <>
            {h.sources} source{h.sources === 1 ? "" : "s"} · {h.chats} chat{h.chats === 1 ? "" : "s"} · {relativeTime(h.lastActivity)}
          </>
        ) : (
          "No research yet · Ask"
        )}
      </div>
    </Link>
  );
}

function StatusLine({ h }: { h: HoldingCardData }) {
  if (h.movement) {
    return (
      <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-medium text-down">
        <span className="size-1.5 shrink-0 rounded-full bg-down" />
        <span className="truncate">Movement open{h.movement.dueAt ? ` · update due ${fmtDateTime(h.movement.dueAt)}` : ""}</span>
      </div>
    );
  }
  if (h.running) {
    return (
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Loader2 className="size-[11px] shrink-0 animate-spin" />
        <span className="truncate">
          {h.running.authorName ?? "Someone"} is asking: {h.running.title}
        </span>
      </div>
    );
  }
  if (h.earnings) {
    return (
      <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground" title={`${h.earnings.dateStatus} · ${h.earnings.hasExpectations ? "expectations recorded" : "expectations not yet recorded"}`}>
        Reports {fmtDate(h.earnings.reportDate)} · {h.earnings.dateStatus} · {h.earnings.hasExpectations ? "expectations recorded" : "no expectations yet"}
      </div>
    );
  }
  return null;
}

const pct = (v: number) => (v < 0 ? `(${Math.abs(v).toFixed(2)}%)` : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);
const bps = (pp: number) => {
  const n = Math.round(Math.abs(pp) * 100);
  return pp < 0 ? `(${n} bps)` : `${pp > 0 ? "+" : ""}${n} bps`;
};

function QuoteCell({ ticker, market, alert }: { ticker: string; market: Promise<MarketByTicker> ; alert: boolean }) {
  const m = use(market)[ticker];
  if (!m || m.changePct === undefined) return <span className="text-[11px] text-muted-foreground">No quote</span>;
  const tone = m.changePct > 0.005 ? "text-up" : m.changePct < -0.005 ? "text-down" : "text-muted-foreground";
  return (
    <span className="shrink-0 text-right font-mono text-xs tabular-nums" title={m.relativePp !== undefined ? `${bps(m.relativePp)} vs S&P 500` : undefined}>
      <span className={cn("font-medium", tone)}>{pct(m.changePct)}</span>
      {m.relativePp !== undefined && <span className={cn("ml-1.5 text-[11px]", alert ? "text-down" : "text-muted-foreground")}>{bps(m.relativePp)}</span>}
    </span>
  );
}
