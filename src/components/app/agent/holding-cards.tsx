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

export function HoldingCards({ holdings, market }: { holdings: HoldingCardData[]; market: Promise<MarketByTicker> }) {
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();
  const shown = holdings.filter((h) => !f || h.ticker.toLowerCase().includes(f) || h.name.toLowerCase().includes(f));
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Research agent</h1>
        <label className="flex h-8 w-full items-center gap-2 rounded-lg border bg-background px-3 text-muted-foreground shadow-xs sm:w-[300px]">
          <Search className="size-3.5 shrink-0" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter holdings…"
            aria-label="Filter holdings"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">No holdings match “{filter.trim()}”.</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {shown.map((h) => (
            <HoldingCard key={h.id} h={h} market={market} />
          ))}
        </div>
      )}
    </>
  );
}

function HoldingCard({ h, market }: { h: HoldingCardData; market: Promise<MarketByTicker> }) {
  const alert = Boolean(h.movement);
  const has = h.chats > 0;
  return (
    <Link
      href={h.href}
      className={cn(
        "flex min-h-[186px] flex-col gap-3 rounded-xl bg-card p-4 ring-1 transition-shadow hover:shadow-[0_0_0_1px_var(--color-foreground)/25,0_2px_8px_rgb(0_0_0/0.06)]",
        alert ? "ring-down/45" : "ring-foreground/10",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg leading-6 font-semibold tracking-tight">{h.ticker}</div>
          <div className="truncate text-xs leading-4 text-muted-foreground">{h.name}</div>
        </div>
        <Suspense fallback={<QuoteSkeleton />}>
          <QuoteCell ticker={h.ticker} market={market} alert={alert} />
        </Suspense>
      </div>
      <StatusLine h={h} />
      <div className="mt-auto flex items-end justify-between gap-2">
        <div className="text-xs leading-4 text-muted-foreground">
          {has ? (
            <>
              <span className="font-medium text-foreground">
                {h.sources} source{h.sources === 1 ? "" : "s"}
              </span>{" "}
              · {h.chats} chat{h.chats === 1 ? "" : "s"} · {relativeTime(h.lastActivity)}
            </>
          ) : (
            "No research yet"
          )}
        </div>
        <span
          className={cn(
            "inline-flex h-7 shrink-0 items-center rounded-md px-2.5 text-[0.8rem] font-medium whitespace-nowrap",
            alert ? "bg-primary text-primary-foreground" : "border bg-background",
          )}
        >
          {has ? "Open chat" : "Ask"}
        </span>
      </div>
    </Link>
  );
}

function StatusLine({ h }: { h: HoldingCardData }) {
  if (h.movement) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs leading-4 font-medium text-down">
        <span className="size-1.5 rounded-full bg-down" />
        Movement open{h.movement.dueAt ? ` · update due ${fmtDateTime(h.movement.dueAt)}` : ""}
      </div>
    );
  }
  if (h.running) {
    return (
      <div className="inline-flex min-w-0 items-center gap-1.5 text-xs leading-4 text-muted-foreground">
        <Loader2 className="size-[11px] shrink-0 animate-spin" />
        <span className="truncate">
          {h.running.authorName ?? "Someone"} is asking: {h.running.title}
        </span>
      </div>
    );
  }
  if (h.earnings) {
    return (
      <div className="text-xs leading-4 text-muted-foreground">
        Reports {fmtDate(h.earnings.reportDate)} · {h.earnings.dateStatus} · {h.earnings.hasExpectations ? "expectations recorded" : "expectations not yet recorded"}
      </div>
    );
  }
  return null;
}

function QuoteSkeleton() {
  return (
    <div className="flex flex-col items-end gap-1">
      <Skeleton className="h-4 w-14" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

const pct = (v: number) => (v < 0 ? `(${Math.abs(v).toFixed(2)}%)` : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);
const bps = (pp: number) => {
  const n = Math.round(Math.abs(pp) * 100);
  return pp < 0 ? `(${n} bps)` : `${pp > 0 ? "+" : ""}${n} bps`;
};

function QuoteCell({ ticker, market, alert }: { ticker: string; market: Promise<MarketByTicker>; alert: boolean }) {
  const m = use(market)[ticker];
  if (!m || m.changePct === undefined) return <div className="text-xs text-muted-foreground">Quote unavailable</div>;
  const tone = m.changePct > 0.005 ? "text-up" : m.changePct < -0.005 ? "text-down" : "text-muted-foreground";
  return (
    <div className="tnum shrink-0 text-right">
      <div className={cn("font-medium", tone)}>{pct(m.changePct)}</div>
      {m.relativePp !== undefined && <div className={cn("text-xs leading-4", alert ? "text-down" : "text-muted-foreground")}>{bps(m.relativePp)} vs S&amp;P</div>}
    </div>
  );
}
