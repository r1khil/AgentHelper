import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { fmtDate, fmtPct } from "@/lib/format";
import { FilterChip, FilterChips } from "@/components/app/panel";
import { RailCard, RailRow } from "@/components/app/rail-card";
import { HoldingLogo } from "@/components/app/holding-logo";
import type { FilingChangeView } from "@/lib/screener/filing-changes/store";
import type { loadChanges, ScreenerScope } from "@/app/(app)/screener/load";
import { screenerHref, type ScreenerQuery } from "@/app/(app)/screener/types";
import { companyHref, Lede, ScreenerFrame } from "./parts";
import { VerdictControl } from "./verdict";

type Data = Awaited<ReturnType<typeof loadChanges>>;

/** The Phase 1 bar: over 60% of flags marked real through one 10-Q cycle. */
const REAL_GOAL = 60;

/**
 * Filing changes: what changed in each covered company's latest 10-K, 10-Q or 8-K against the right earlier filing,
 * newest first, each with its quote and a link to the filing, and a lead's Real or Noise. 8-K item codes are flagged
 * by code alone.
 */
export function ChangesTab({ q, scope, data }: { q: ScreenerQuery; scope: ScreenerScope; data: Data }) {
  const precision = data.marked ? (data.real / data.marked) * 100 : null;
  const manageable = new Set(scope.manageable.map((t) => t.id));
  const teamOf = new Map(data.covered.map((c) => [c.ticker, c]));
  return (
    <ScreenerFrame
      q={q}
      scope={scope}
      rail={
        <>
          <RailCard id="changes-queue" title="The detector" note="Runs each evening on holdings and watchlist names. Risk factors are read first, then MD&A, then the rest.">
            <RailRow label="Companies covered">{data.covered.length}</RailRow>
            <RailRow label="Waiting to be read">{data.queued === 0 ? <span className="text-muted-foreground">None</span> : <span className="font-semibold">{data.queued}</span>}</RailRow>
          </RailCard>
          <RailCard id="changes-precision" title="Marked so far" note={`The bar: over ${REAL_GOAL}% real through one 10-Q cycle. Noise tells us to raise the threshold.`}>
            <RailRow label="Marked">{`${data.marked} of ${data.total}`}</RailRow>
            <RailRow label="Real">{precision === null ? <span className="text-muted-foreground">—</span> : <span className={precision < REAL_GOAL ? "font-semibold text-caution-foreground" : "font-semibold"}>{fmtPct(precision, 0)}</span>}</RailRow>
          </RailCard>
        </>
      }
    >
      <Lede>What changed in the latest filings of the fund&apos;s holdings and watchlist names, against the right earlier filing. Mark each one real or noise.</Lede>
      <div className="mt-4 flex items-center gap-3 border-b pb-3">
        <FilterChips label="Which changes">
          <FilterChip href={screenerHref(q, { showAll: false })} active={!q.showAll} count={data.toMark}>
            To mark
          </FilterChip>
          <FilterChip href={screenerHref(q, { showAll: true })} active={q.showAll} count={data.total}>
            All
          </FilterChip>
        </FilterChips>
      </div>
      {data.changes.length === 0 ? (
        <p className="border-b py-4 text-body text-muted-foreground">
          {data.covered.length === 0 ? "No holdings or watchlist names in view yet." : q.showAll ? "No filing changes yet. The detector reads each new 10-K, 10-Q and 8-K the evening it is filed." : "Nothing to mark. Every change has a verdict."}
        </p>
      ) : (
        <ul aria-label="Filing changes">
          {data.changes.map((c) => (
            <ChangeRow key={c.id} c={c} canMark={manageable.has(teamOf.get(c.ticker)?.teamId ?? "")} showTicker />
          ))}
        </ul>
      )}
    </ScreenerFrame>
  );
}

/** One change: the company, what kind of change, where, the one-line summary and the quote, then the verdict. */
export function ChangeRow({ c, canMark, showTicker }: { c: FilingChangeView; canMark: boolean; showTicker?: boolean }) {
  const where = c.kind === "8k" ? `8-K item ${c.item.replace(/^8-K\s*/, "")}` : `${c.form} Item ${c.item}`;
  return (
    <li className="flex gap-4 border-b border-row py-3.5">
      {showTicker && (
        <Link href={companyHref(c.ticker)} className="flex w-[92px] shrink-0 items-center gap-2 self-start pt-px font-semibold hover:underline">
          <HoldingLogo ticker={c.ticker} size={20} />
          {c.ticker}
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-body font-semibold">{c.labelText}</span>
          <span className="text-caption text-muted-foreground">
            {where}, filed {fmtDate(c.filedAt)}
          </span>
        </div>
        {c.summary && <p className="mt-0.5 max-w-[72ch] text-body text-ink-2">{c.summary}</p>}
        {c.quote && (
          <blockquote className="mt-1.5 max-w-[72ch] text-body text-muted-foreground">
            &ldquo;{c.quote}&rdquo;{" "}
            <a href={c.filingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 whitespace-nowrap font-semibold text-foreground hover:underline">
              Filing
              <ArrowUpRight className="size-3" aria-hidden />
            </a>
          </blockquote>
        )}
        {!c.quote && (
          <a href={c.filingUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-0.5 text-body font-semibold hover:underline">
            Open the filing
            <ArrowUpRight className="size-3" aria-hidden />
          </a>
        )}
      </div>
      <div className="shrink-0 self-start">
        <VerdictControl id={c.id} verdict={(c.verdict as "real" | "noise" | null) ?? null} disabled={!canMark} />
      </div>
    </li>
  );
}
