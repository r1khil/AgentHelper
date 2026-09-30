import { fmtDate } from "@/lib/format";
import { horizonEnd } from "@/lib/screener/calibration";
import type { PitchView } from "@/lib/screener/pitches";
import type { Tone } from "./parts";

/** Where a pitch stands: scored (hit or missed), a kill criterion met, or still running. */
export function pitchState(p: PitchView, today: string): { word: string; tone: Tone; title?: string } {
  if (p.outcome) return p.outcome.hitTarget ? { word: "Hit target", tone: "ink" } : { word: "Missed target", tone: "grey" };
  const met = p.killCriteria.filter((c) => c.tripped);
  if (met.length) return { word: "Kill criterion met", tone: "caution", title: met.map((c) => c.text).join("; ") };
  const end = horizonEnd(p.pitchedOn, p.horizonMonths);
  return { word: end <= today ? "Scoring" : `Runs to ${fmtDate(end)}`, tone: "grey" };
}
