"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { leaveHootQuestion } from "@/components/app/hoot/handoff";
import { pageContextFor } from "@/components/app/hoot/page-context";
import { startHootChat } from "@/lib/actions/chats";
import { isUpcoming, shownActual, surprise, untilText } from "@/lib/economic-calendar/view";
import type { EconomicEvent } from "@/lib/economic-calendar/types";
import { NY } from "@/lib/providers/calendar";
import { cn } from "@/lib/utils";

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

/** "8:30", "14:00" in New York; the feed's own word ("TBA", "All day") when it has no time. */
export function releaseClock(e: EconomicEvent) {
  return e.timestamp ? et(e.timestamp).toFormat("H:mm") : e.time;
}

/** The detail column: the actual against consensus once it's out, consensus and prior before. Speeches have none. */
export function releaseFigures(e: EconomicEvent, now: number | null): ReactNode {
  const actual = shownActual(e, now);
  if (actual === null && e.estimate === null && e.previous === null) return e.marketImplied ? marketText(e) : null;
  if (actual !== null)
    return (
      <>
        <span className="font-semibold text-foreground">Act {actual}</span>
        <span title={consensusSource(e)}> · Cons {e.estimate ?? "—"}</span>
      </>
    );
  return (
    <>
      <span title={consensusSource(e)}>Cons {e.estimate ?? (e.marketImplied ? marketText(e) : "—")}</span>
      <span title={revised(e) ? `Revised from ${e.previousBeforeRevision}` : undefined}>
        {" · "}Prior {e.previous ?? "—"}
        {revised(e) && "*"}
      </span>
    </>
  );
}

/** The status column: a countdown before the release, the direction against consensus after it, else its importance. */
export function ReleaseStatus({ event: e, now, today, isNext }: { event: EconomicEvent; now: number | null; today: string | null; isNext: boolean }) {
  if (now === null || today === null) return null;
  const actual = shownActual(e, now);
  const until = e.timestamp ? untilText(Date.parse(e.timestamp) - now) : "";
  if (isNext)
    return <span className="inline-flex h-[22px] items-center rounded-full bg-primary px-[9px] font-mono text-[11.5px] font-medium whitespace-nowrap text-primary-foreground">Next · {until}</span>;
  if (actual !== null) {
    const s = surprise(actual, e.estimate);
    if (s?.dir === "above" || s?.dir === "below")
      return (
        <span className={cn("inline-flex items-center gap-1 font-mono text-[12px] font-medium whitespace-nowrap", s.dir === "above" ? "text-above" : "text-below")}>
          <svg viewBox="0 0 8 8" className="size-2" aria-hidden="true">
            <path d={s.dir === "above" ? "M4 1 7.5 6.5h-7z" : "M4 7 .5 1.5h7z"} fill="currentColor" />
          </svg>
          {s.text}
        </span>
      );
    if (s?.dir === "inline") return <span className="text-[12.5px] font-medium text-ink-2">In line</span>;
    return <span className="text-[12.5px] text-muted-foreground">Released</span>;
  }
  if (e.date === today && isUpcoming(e, now)) return <span className="font-mono text-[12px] text-muted-foreground">{until}</span>;
  if (e.date === today && e.timestamp && !isUpcoming(e, now) && (e.estimate || e.previous)) return <span className="text-[12.5px] text-muted-foreground">Awaiting</span>;
  if (e.importance === 3) return <span className="text-[12.5px] font-medium text-foreground">High impact</span>;
  return null;
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

/** Opens a Hoot chat with a question already written, from anywhere on the page. */
function useAskHoot(teamSlug: string | null) {
  const router = useRouter();
  const pathname = usePathname();
  const [asking, setAsking] = useState(false);
  const ask = async (question: string) => {
    setAsking(true);
    try {
      const res = await startHootChat({ teamSlug, ticker: null });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      if (!leaveHootQuestion(res.chatId, question, pageContextFor(pathname))) toast("Your chat is open. Paste your question to send it.");
      router.push(res.href);
    } catch {
      toast.error("Couldn't open a chat just now. Try again in a moment.");
    } finally {
      setAsking(false);
    }
  };
  return { asking, ask };
}

function hootQuestion(e: EconomicEvent, now: number) {
  const name = `${e.name}${e.period ? ` (${e.period})` : ""}`;
  const actual = shownActual(e, now);
  if (actual !== null)
    return `${name} came in at ${actual} against a consensus of ${e.estimate ?? "none published"}; the previous reading was ${e.previous ?? "not available"}. What does that mean for our holdings?`;
  if (!e.timestamp) return `What should we know about ${name} on ${DateTime.fromISO(e.date).toFormat("cccc, MMM d")}? Which of our holdings could it affect?`;
  const at = et(e.timestamp).toFormat("cccc h:mm a");
  if (!isUpcoming(e, now)) return `What came out of ${name} on ${at} ET, and which of our holdings could it affect?`;
  return `What should we watch in ${name}, due ${at} ET? Consensus is ${e.estimate ?? "not available"} and the previous reading was ${e.previous ?? "not available"}.${e.marketImplied ? ` ${e.marketImplied.source} traders price ${e.marketImplied.detail === "median" ? `a median of ${e.marketImplied.value}` : `${e.marketImplied.value} (${e.marketImplied.detail})`}.` : ""} Which of our holdings are most exposed to a surprise either way?`;
}

function AskHoot({ event: e, now, teamSlug, label }: { event: EconomicEvent; now: number; teamSlug: string | null; label: string }) {
  const { asking, ask } = useAskHoot(teamSlug);
  return (
    <Button variant="outline" size="sm" disabled={asking} onClick={() => void ask(hootQuestion(e, now))}>
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
    status = isNext ? `Next release, ${untilText(at.toMillis() - now)}` : `Scheduled, ${e.date === today ? "today" : at.toFormat("cccc")} ${at.toFormat("h:mm a")} ET`;
  else if (!at) status = `${e.time}, ${DateTime.fromISO(e.date).toFormat("cccc, MMM d")}`;
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
    <div id={id} className="px-5 pt-0.5 pb-3 pl-[206px] max-lg:pl-5">
      <div className="flex items-start gap-5 rounded-[10px] bg-band px-4 py-3">
        <div className="min-w-0 flex-1">
          <dl className="grid grid-cols-3 gap-x-5 gap-y-2.5 xl:grid-cols-5">
            {fields.map(([k, v]) => (
              <div key={k} className="flex min-w-0 flex-col gap-0.5">
                <dt className="label-mono text-[10.5px] text-muted-foreground">{k}</dt>
                <dd className="text-[12.5px] leading-[18px] break-words">{v}</dd>
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

/** Where today's clock sits among its releases. */
export function NowLine({ now }: { now: number }) {
  return (
    <div className="flex h-6 items-center gap-2.5 px-5" aria-hidden="true">
      <span className="rounded-full bg-primary px-2 font-mono text-[10.5px] leading-[18px] font-medium text-primary-foreground">NOW {DateTime.fromMillis(now, { zone: NY }).toFormat("H:mm")}</span>
      <span className="h-px flex-1 bg-foreground/60" />
    </div>
  );
}
