"use client";

import type { ReactNode } from "react";
import { DateTime } from "luxon";
import { Button } from "@/components/ui/button";
import { useAskHoot } from "@/components/app/hoot/use-ask-hoot";
import { isUpcoming, shownActual, surprise, untilText } from "@/lib/economic-calendar/view";
import type { EconomicEvent } from "@/lib/economic-calendar/types";
import { NY } from "@/lib/providers/calendar";
import { fmtDateTime, fmtDay, fmtTime } from "@/lib/format";

export { releaseClock, releaseResult } from "@/lib/economic-calendar/result";

// One economic release's pieces: its figures, its status against consensus, and everything else behind a click.

export type Importance = "all" | "high" | "med";
export const IMPORTANCE: { id: Importance; label: string; keep: (e: EconomicEvent) => boolean }[] = [
  { id: "all", label: "All", keep: () => true },
  { id: "high", label: "High", keep: (e) => e.importance === 3 },
  { id: "med", label: "Medium+", keep: (e) => (e.importance ?? 0) >= 2 },
];
export const IMPORTANCE_LABEL = ["Not rated", "Low", "Medium", "High"];

export const et = (iso: string) => DateTime.fromISO(iso).setZone(NY);
export const releaseDomId = (e: EconomicEvent) => `release-${e.id.replace(/[^\w-]/g, "-")}`;
export const revised = (e: EconomicEvent) => e.previousBeforeRevision !== null && e.previousBeforeRevision !== e.previous;
export const consensusSource = (e: EconomicEvent) => (e.estimate && e.estimateSource ? `Consensus from ${e.estimateSource}` : undefined);
export const marketText = (e: EconomicEvent) =>
  e.marketImplied && `${e.marketImplied.source} ${e.marketImplied.value}${e.marketImplied.detail === "median" ? "" : ` (${e.marketImplied.detail})`}`;

/** The detail column: the actual against consensus once it's out, consensus and prior before. Speeches have none. */
export function releaseFigures(e: EconomicEvent, now: number | null): ReactNode {
  const actual = shownActual(e, now);
  if (actual === null && e.estimate === null && e.previous === null) return e.marketImplied ? marketText(e) : null;
  if (actual !== null)
    return (
      <>
        <span className="font-semibold text-foreground">Act {actual}</span>
        <span title={consensusSource(e)}>, cons {e.estimate ?? "—"}</span>
      </>
    );
  return (
    <>
      {/* A market price isn't a consensus: without a survey figure it stands under its own name ("Kalshi 0.17%"). */}
      {e.estimate === null && e.marketImplied ? <span>{marketText(e)}</span> : <span title={consensusSource(e)}>Cons {e.estimate ?? "—"}</span>}
      <span title={revised(e) ? `Revised from ${e.previousBeforeRevision}` : undefined}>
        {", "}prior {e.previous ?? "—"}
        {revised(e) && "*"}
      </span>
    </>
  );
}

/** A prediction market's price for a release, set apart from consensus: it isn't a survey. */
function MarketPrice({ e }: { e: EconomicEvent }) {
  const m = e.marketImplied;
  if (!m) return <>None</>;
  return (
    <>
      <a href={m.url} target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-2 hover:decoration-foreground">
        {m.source} {m.value}
      </a>
      , {m.detail === "median" ? "median outcome" : `likeliest outcome, ${m.detail}`}. A prediction-market price, not consensus.
    </>
  );
}

function hootQuestion(e: EconomicEvent, now: number) {
  const name = `${e.name}${e.period ? ` (${e.period})` : ""}`;
  const actual = shownActual(e, now);
  if (actual !== null)
    return `${name} came in at ${actual} against a consensus of ${e.estimate ?? "none published"}; the previous reading was ${e.previous ?? "not available"}. What does that mean for our holdings?`;
  if (!e.timestamp) return `What should we know about ${name} on ${fmtDay(e.date)}? Which of our holdings could it affect?`;
  const at = fmtDateTime(e.timestamp);
  if (!isUpcoming(e, now)) return `What came out of ${name} on ${at}, and which of our holdings could it affect?`;
  return `What should we watch in ${name}, due ${at}? Consensus is ${e.estimate ?? "not available"} and the previous reading was ${e.previous ?? "not available"}.${e.marketImplied ? ` ${e.marketImplied.source} traders price ${e.marketImplied.detail === "median" ? `a median of ${e.marketImplied.value}` : `${e.marketImplied.value} (${e.marketImplied.detail})`}.` : ""} Which of our holdings are most exposed to a surprise either way?`;
}

function AskHoot({ event: e, now, teamSlug, label }: { event: EconomicEvent; now: number; teamSlug: string | null; label: string }) {
  // The same way in as ⌘K: a Research conversation with the question already written.
  const { asking, ask } = useAskHoot();
  return (
    <Button variant="secondary" size="sm" disabled={asking} onClick={() => void ask(hootQuestion(e, now), { teamSlug, ticker: null })}>
      {asking ? "Opening Hoot…" : label}
    </Button>
  );
}

/** Every field of one release in one place, under its row. */
export function ReleaseDetails({
  id,
  event: e,
  now,
  today,
  isNext,
  askable,
  teamSlug,
  factorLine,
}: {
  id: string;
  event: EconomicEvent;
  now: number;
  today: string;
  isNext: boolean;
  askable: boolean;
  teamSlug: string | null;
  /** The release's factor-sensitivity line, when it has one. */
  factorLine?: ReactNode;
}) {
  const actual = shownActual(e, now);
  const s = surprise(actual, e.estimate);
  const at = e.timestamp ? et(e.timestamp) : null;
  let status: string;
  if (actual !== null)
    status = s?.dir === "above" || s?.dir === "below" ? `Released, ${s.text} consensus` : s?.dir === "inline" ? "Released, in line with consensus" : "Released";
  else if (at && isUpcoming(e, now))
    status = isNext ? `Next release, ${untilText(at.toMillis() - now)}` : `Scheduled, ${e.date === today ? `today ${fmtTime(at.toJSDate())}` : fmtDateTime(at.toJSDate())}`;
  else if (!at) status = `${e.time}, ${fmtDay(e.date)}`;
  else status = e.estimate || e.previous ? "Time passed, no figure reported yet" : "Time passed";
  if (e.tentative) status += " (tentative)";
  const link = "underline decoration-border underline-offset-2 hover:decoration-foreground";
  const fields: [string, ReactNode][] = [
    ["Actual", actual ?? "—"],
    ["Consensus", e.estimate ? `${e.estimate}, economist survey${e.estimateSource ? ` via ${e.estimateSource}` : ""}` : "None published"],
    ["Previous", e.previous ? (revised(e) ? `${e.previous}, revised from ${e.previousBeforeRevision}` : e.previous) : "—"],
    ["Market price", <MarketPrice key="m" e={e} />],
    ["Period", e.period ?? "—"],
    ["Unit", e.unit ?? "—"],
    ["Importance", IMPORTANCE_LABEL[e.importance ?? 0]],
    [
      "Source",
      e.sourceUrl ? (
        <a href={e.sourceUrl} target="_blank" rel="noreferrer" className={link}>
          {e.source ?? "Source"}
        </a>
      ) : (
        (e.source ?? "—")
      ),
    ],
    ["Status", status],
  ];
  return (
    <div id={id} className="border-b border-row py-3">
      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1">
          <dl className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-5 gap-y-2.5">
            {fields.map(([k, v]) => (
              <div key={k} className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-caption text-muted-foreground">{k}</dt>
                <dd className="text-body break-words">{v}</dd>
              </div>
            ))}
          </dl>
          {factorLine}
        </div>
        {askable && <AskHoot event={e} now={now} teamSlug={teamSlug} label={isNext ? "Ask Hoot what to watch" : "Ask Hoot"} />}
      </div>
    </div>
  );
}
