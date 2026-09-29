import type { EconomicEvent } from "./types";
import { isUpcoming, shownActual, surprise, untilText } from "./view";
import { fmtTime } from "@/lib/format";

// A release's time and result as the calendar words them. Pure, so the table and the tests read the same rules.

/** "8:30 AM ET" in New York; the feed's own word ("TBA", "All day") when it has no time. */
export function releaseClock(e: EconomicEvent) {
  return e.timestamp ? fmtTime(e.timestamp) : e.time;
}


/**
 * A release's result in words, never a colour alone. Released: the figure and how it compares with consensus, as fact
 * ("Released 0.3%, in line", "Released 0.4%, 0.1 pp above consensus"), with no judgement of good or bad. The next one
 * counts down; one whose time passed with no figure is amber; the rest are awaiting.
 */
export function releaseResult(e: EconomicEvent, now: number | null, today: string | null, isNext: boolean): { text: string; tone: "ink" | "grey" | "caution" } {
  if (now === null || today === null) return { text: "", tone: "grey" };
  const actual = shownActual(e, now);
  if (actual !== null) {
    const s = surprise(actual, e.estimate);
    const vs = s?.dir === "above" || s?.dir === "below" ? `, ${s.text} consensus` : s?.dir === "inline" ? ", in line" : e.estimate === null ? ", no consensus published" : "";
    return { text: `Released ${actual}${vs}`, tone: "ink" };
  }
  if (isNext && e.timestamp) return { text: `Next, ${untilText(Date.parse(e.timestamp) - now)}`, tone: "ink" };
  const figures = Boolean(e.estimate || e.previous);
  if (e.timestamp && !isUpcoming(e, now)) return figures ? { text: "Time passed, no figure yet", tone: "caution" } : { text: "Time passed", tone: "grey" };
  if (!e.timestamp && e.date < today) return figures ? { text: "Day passed, no figure yet", tone: "caution" } : { text: "Day passed", tone: "grey" };
  return { text: "Awaiting", tone: "grey" };
}
