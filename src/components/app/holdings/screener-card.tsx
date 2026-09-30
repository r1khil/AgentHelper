import Link from "next/link";
import { todayNY } from "@/lib/providers/calendar";
import { listFilingChanges } from "@/lib/screener/filing-changes/store";
import { listPitches } from "@/lib/screener/pitches";
import { pitchState } from "@/components/app/screener/pitch-state";
import { companyHref } from "@/components/app/screener/parts";
import { RailCard, type RailRow } from "./rail";

/**
 * A holding in the Screener: filing changes still to mark and where the team's pitch stands, linking to the company's
 * Screener page (tear sheet, reverse DCF, bear case). Streams in after the page.
 */
export async function ScreenerCard({ ticker }: { ticker: string }) {
  const [changes, pitches] = await Promise.all([listFilingChanges({ tickers: [ticker], limit: 50 }).catch(() => []), listPitches({ ticker, limit: 1 }).catch(() => [])]);
  const toMark = changes.filter((c) => !c.verdict && !c.dismissedBy).length;
  const pitch = pitches[0];
  const rows: RailRow[] = [
    { k: "Filing changes", v: toMark ? `${toMark} to mark` : changes.length ? "All marked" : "None flagged", tone: toMark ? "caution" : "muted" },
    ...(pitch ? [{ k: "Pitch", v: pitchState(pitch, todayNY()).word, tone: pitch.killCriteria.some((c) => c.tripped) ? ("caution" as const) : ("muted" as const) }] : []),
  ];
  return (
    <RailCard
      id="screener-h"
      title="Screener"
      aside={
        <Link href={companyHref(ticker, toMark ? "changes" : undefined)} className="hover:text-foreground">
          Open
        </Link>
      }
      rows={rows}
      note={pitch ? undefined : "The reverse DCF, value-trap checklist and bear case are on its Screener page."}
    />
  );
}
