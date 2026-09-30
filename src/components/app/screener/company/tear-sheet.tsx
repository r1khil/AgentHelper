import type { ScreenHit, TearSheet } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import { METRIC_DEFS } from "@/lib/screener/metrics";
import { fmtMetric } from "../metric-format";
import { StatusWord } from "../parts";
import { CitedProse, Cite, SourceList } from "./cited-prose";
import { RateSheet, WriteSheet } from "./sheet-controls";

/**
 * A screen hit's tear sheet: what the business is, why it screens cheap (the screen's numbers, from code), the
 * obvious reason it might deserve to be, and three things to check first, every sentence cited. A sheet that failed a
 * check is held back and says why.
 */
export function TearSheetTab({ ticker, hit, sheet, canWrite }: { ticker: string; hit: ScreenHit | null; sheet: TearSheet | null; canWrite: boolean }) {
  if (!hit) {
    return <p className="border-b py-4 text-body text-muted-foreground">{ticker} wasn&apos;t in this month&apos;s screen. Tear sheets are written for each team&apos;s top five hits; the filing changes, reverse DCF and bear case work for any company.</p>;
  }
  const cheap = (
    <section aria-labelledby="sheet-cheap" className="mt-7">
      <h2 id="sheet-cheap" className="text-body font-semibold">
        Why it screens cheap
      </h2>
      <dl className="mt-2 grid max-w-[560px] grid-cols-2 gap-x-8 text-body">
        {METRIC_DEFS.filter((d) => d.track !== "garp" || hit.track === "garp").map((d) => (
          <div key={d.key} title={d.help} className="flex min-h-[34px] items-center justify-between gap-3 border-b border-row">
            <dt className="truncate text-ink-2">{d.label}</dt>
            <dd className="tabular-nums">{fmtMetric(d, hit.metrics[d.key] ?? null)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-caption text-muted-foreground">
        From SEC filings, fiscal year ended {hit.periodEnd ? fmtDate(hit.periodEnd) : "on record"}. Rank {hit.teamRank ?? hit.rank} for the team this month.
      </p>
    </section>
  );

  if (!sheet || sheet.status === "held" || !sheet.body) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-3 border-b pb-3">
          {sheet?.status === "held" ? (
            <p className="flex-1 text-body">
              <StatusWord tone="caution">Held back</StatusWord> <span className="text-ink-2">{sheet.heldReason ?? "It failed a check."} Nothing unchecked is shown.</span>
            </p>
          ) : (
            <p className="flex-1 text-body text-ink-2">Not written yet. Hoot writes one for each team&apos;s top five hits, from the latest 10-K and 10-Q.</p>
          )}
          {canWrite && <WriteSheet hitId={hit.id} label={sheet ? "Try again" : "Write it now"} />}
        </div>
        {cheap}
      </div>
    );
  }

  const body = sheet.body;
  return (
    <article aria-label={`${ticker} tear sheet`}>
      <section aria-labelledby="sheet-business">
        <h2 id="sheet-business" className="text-body font-semibold">
          The business
        </h2>
        <CitedProse sentences={body.business} citations={sheet.citations} className="hoot-prose mt-1.5 max-w-[68ch]" />
      </section>
      {cheap}
      <section aria-labelledby="sheet-deserve" className="mt-7">
        <h2 id="sheet-deserve" className="text-body font-semibold">
          Why it might deserve to be cheap
        </h2>
        <CitedProse sentences={body.mightDeserve} citations={sheet.citations} className="hoot-prose mt-1.5 max-w-[68ch]" />
      </section>
      <section aria-labelledby="sheet-check" className="mt-7">
        <h2 id="sheet-check" className="text-body font-semibold">
          What to check first
        </h2>
        <ol className="mt-2 flex max-w-[68ch] flex-col gap-2.5">
          {body.questions.map((qn, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-[5px] w-4 shrink-0 text-right text-body font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
              <span>
                <span className="hoot-prose">
                  {qn.text}
                  {qn.cites.map((n) => (
                    <Cite key={n} n={n} c={sheet.citations.find((c) => c.n === n)} />
                  ))}
                </span>
                <span className="block text-caption text-muted-foreground">{qn.section}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
      <SourceList citations={sheet.citations} />
      <div className="mt-5 flex flex-wrap items-center gap-3 text-caption text-muted-foreground">
        <span>Written {fmtDate(sheet.createdAt)}, every quote checked against the filing.</span>
        <span className="flex-1" />
        <RateSheet id={sheet.id} rating={(sheet.rating as "useful" | "not_useful" | null) ?? null} />
        {canWrite && <WriteSheet hitId={hit.id} label="Rewrite" quiet />}
      </div>
    </article>
  );
}
