import Link from "next/link";
import { DateTime } from "luxon";
import type { Earnings, Holding } from "@/db/schema";
import { holdingHref } from "@/lib/scope";
import type { Actuals } from "@/lib/earnings";
import { expectationsWord, prepBuildDate } from "@/lib/earnings-calendar";
import { gatherResults, lockChecklist, markReviewed, requestEarningsFeedback, saveChecklist, saveReflection } from "@/lib/actions/earnings";
import { PrepPackCard } from "@/components/app/agent/prep-pack-card";
import { expectationsDue } from "@/components/app/holdings/attention";
import { fmtCurrency, fmtDateTime, fmtDay, fmtDayMonth, relativeTime } from "@/lib/format";
import { NY } from "@/lib/providers/calendar";
import { cn } from "@/lib/utils";
import { PageHead, PageHero } from "@/components/app/page-head";
import { OwlMark } from "@/components/app/owl-mark";
import { FeedbackPanel } from "@/components/app/feedback-panel";
import { PrepPackBuild } from "@/components/app/earnings/prep-pack-build";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type ReportViewProps = {
  e: Earnings;
  h: Pick<Holding, "ticker" | "companyName">;
  team: { name: string; slug: string };
  /** The scope in the URL (the fund or a team), for the way back to the calendar and the link to the holding. */
  scopeSlug: string;
  evidence: { id: string; title: string; url: string | null; publisher: string | null; publishedAt: Date | null }[];
  /** Who a newly built pack is emailed to; empty when the reader can't build one. */
  recipients: { name: string; email: string }[];
  /** The reader may build the pack now (a lead, exec or admin, before the report, with Hoot set up). */
  canBuild: boolean;
  /** Hoot is set up, so "Get feedback" is offered. */
  agentOn: boolean;
  error?: string;
  today: string;
};

/** One earnings report: expectations before, sourced results after, the reflection last, with the prep pack and timeline beside. */
export function ReportView({ e, h, team, scopeSlug, evidence, recipients, canBuild, agentOn, error, today }: ReportViewProps) {
  const actuals = e.actuals as Actuals | null;
  const locked = Boolean(e.preLockedAt);
  const reported = e.reportDate <= today;
  const sourceById = new Map((actuals?.sources ?? []).map((s) => [s.id, s]));
  const state = locked ? "locked" : e.expectations?.trim() ? "draft" : "not_started";
  const due = expectationsDue(e.reportDate, e.reportHour);
  const word = expectationsWord(state, e, today);
  const buildOn = prepBuildDate(e.reportDate);
  const period = e.fiscalPeriod ? (/^Q\d/i.test(e.fiscalPeriod) ? `fiscal ${e.fiscalPeriod}` : e.fiscalPeriod) : "earnings";
  const hour = e.reportHour ? HOUR_WORD[e.reportHour] : null;

  // Where this report stands in the run-up, in the order things happen.
  const now = locked ? (reported ? (e.status === "reviewed" ? "Reviewed" : "Reflection due") : "Expectations locked") : reported ? "Report is out, expectations not locked" : "Writing expectations";
  const timeline = [
    { d: "Now", t: now, current: true },
    { d: fmtDayMonth(buildOn), t: e.prepPack ? "Prep pack built" : "Prep pack builds", current: false },
    { d: fmtDayMonth(due), t: "Expectations due", current: false },
    { d: fmtDayMonth(e.reportDate), t: "Report · expectations lock", current: false },
    { d: "After", t: "Results gathered · reflection due", current: false },
  ];

  return (
    <>
      <PageHead
        crumbs={[{ label: "Calendar", href: `/t/${scopeSlug}/earnings` }, { label: `${h.ticker} · ${period}` }]}
        asof={`${team.name} · ${h.companyName ?? h.ticker}`}
        actions={
          <Button nativeButton={false} render={<Link href={holdingHref(scopeSlug, team.slug, h.ticker)} />} variant="secondary">
            Open holding
          </Button>
        }
      />
      <div className="flex gap-14">
        <div className="flex min-w-0 flex-1 flex-col">
          <PageHero
            label={`Reports ${fmtDay(e.reportDate)}${hour ? `, ${hour}` : ""} · ${e.dateStatus === "estimated" ? "estimated, not confirmed by the company" : "confirmed by the company"}`}
            value={untilReport(e.reportDate, today)}
            note={
              <>
                {e.epsEstimate ? `Consensus EPS ${fmtCurrency(e.epsEstimate, e.epsCurrency)} · ` : ""}
                {e.revenueEstimate ? `consensus revenue ${fmtCurrency(e.revenueEstimate, e.revenueCurrency, { scale: 1e9, suffix: "B" })} · ` : ""}
                {locked ? `expectations locked ${relativeTime(e.preLockedAt)}` : "the team's expectations lock when the report lands"}
              </>
            }
          />
          {error && <p role="alert" className="mt-4 text-body font-semibold text-caution-foreground">{error}</p>}

          {e.prepPack && (
            <section id="prep-pack" aria-labelledby="prep" className="mt-6 scroll-mt-24 border-t pt-[18px]">
              <h2 id="prep" className="sr-only">
                Prep pack
              </h2>
              <PrepPackCard pack={e.prepPack} plain />
            </section>
          )}

          <section aria-labelledby="exp" className="mt-6 border-t pt-[18px]">
            <div className="flex items-baseline gap-3">
              <h2 id="exp" className="flex-1 text-title font-bold tracking-[-0.01em]">
                1 · Before the report: your expectations
              </h2>
              <span className={cn("text-caption font-semibold", !locked && word.tone === "caution" ? "text-caution-foreground" : "text-muted-foreground")}>{locked ? `Locked ${relativeTime(e.preLockedAt)}` : word.text}</span>
            </div>
            {locked ? (
              <dl className="mt-1 flex flex-col">
                <Item label="What you expect">{e.expectations}</Item>
                <Item label="Key questions">{e.keyQuestions}</Item>
                <Item label="What would change the thesis">{e.thesisChangeCriteria}</Item>
              </dl>
            ) : (
              <form className="flex flex-col">
                <input type="hidden" name="id" value={e.id} />
                <Field label="What you expect" name="expectations" value={e.expectations} rows={3} placeholder="Your numbers and why (revenue, margins, guidance, the narrative)" />
                <Field label="Key questions" name="keyQuestions" value={e.keyQuestions} rows={2} placeholder="What would you ask management?" />
                <Field label="What would change the thesis" name="thesisChangeCriteria" value={e.thesisChangeCriteria} rows={2} placeholder="The result that would make the team rethink" />
                <div className="mt-3.5 flex items-center gap-2">
                  <Button type="submit" formAction={saveChecklist} variant="secondary">
                    Save
                  </Button>
                  <span className="flex-1" />
                  <span className="text-caption text-muted-foreground">Locks automatically on {fmtDayMonth(e.reportDate)} if you don&apos;t</span>
                  <Button type="submit" formAction={lockChecklist}>
                    Lock expectations
                  </Button>
                </div>
                <p className="mt-2 text-caption text-muted-foreground">Locking preserves your view so you can revisit it honestly afterwards. Hoot reads it only to give feedback.</p>
              </form>
            )}
          </section>

          <section aria-labelledby="res" className="mt-[30px] border-t pt-[18px]">
            <div className="flex items-center gap-3">
              <h2 id="res" className="flex-1 text-title font-bold tracking-[-0.01em]">
                2 · After the report: sourced results
              </h2>
              <form action={gatherResults}>
                <input type="hidden" name="id" value={e.id} />
                <Button type="submit" size="sm" variant="secondary" disabled={!reported} title={reported ? "Pull the 8-K, press release, and reported figures" : "Available on the report date"}>
                  {reported ? (actuals ? "Refresh results" : "Gather results") : `Gather results · from ${fmtDayMonth(e.reportDate)}`}
                </Button>
              </form>
            </div>
            <div role="table" aria-label="Results" className="mt-2.5 text-body">
              <div role="row" className={cn(RESULTS_GRID, "h-8 border-b text-caption text-muted-foreground")}>
                <span role="columnheader">Metric</span>
                <span role="columnheader" className="text-right">
                  Actual
                </span>
                <span role="columnheader" className="text-right">
                  Prior year
                </span>
                <span role="columnheader" className="text-right" title="Guidance given before the report">
                  Guidance
                </span>
                <span role="columnheader" className="text-right">
                  Estimate
                </span>
                <span role="columnheader">Source</span>
              </div>
              {actuals && actuals.rows.length > 0 ? (
                actuals.rows.map((r, i) => {
                  const src = r.sourceId ? sourceById.get(r.sourceId) : undefined;
                  return (
                    <div key={i} role="row" className={cn(RESULTS_GRID, "min-h-[34px] border-b border-row py-1")}>
                      <span role="cell" className="text-ink-3">
                        {r.metric}
                        {r.note ? <span className="block text-caption text-muted-foreground">{r.note}</span> : null}
                      </span>
                      <Figure v={r.actual} />
                      <Figure v={r.priorYear} />
                      <Figure v={r.priorGuidance} />
                      <Figure v={r.estimate} />
                      <span role="cell" className="truncate">
                        {src ? (
                          <a href={src.url} target="_blank" rel="noreferrer" className="hover:underline">
                            {src.id}
                          </a>
                        ) : (
                          <span className="font-semibold text-caution-foreground">none</span>
                        )}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div role="row" className={cn(RESULTS_GRID, "min-h-[34px] border-b border-row py-1")}>
                  <span role="cell" aria-colspan={6} className="col-span-6 text-muted-foreground">
                    {!reported
                      ? `Results can be gathered from ${fmtDay(e.reportDate)}: revenue, adjusted EPS and the segment lines, from the release and XBRL only. The morning sweep also does this automatically.`
                      : !actuals
                        ? "Not gathered yet. Choose “Gather results” to pull the 8-K and press release from EDGAR."
                        : "No figures could be extracted yet."}
                  </span>
                </div>
              )}
            </div>
            {actuals && (
              <div className="mt-3">
                {actuals.missing.length > 0 && (
                  <ul className="mb-2 list-disc space-y-0.5 pl-5 text-body text-caution-foreground">
                    {actuals.missing.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                )}
                <p className="text-caption text-muted-foreground">Extracted {relativeTime(actuals.extractedAt)} from the sources below. Check every number against the release before relying on it.</p>
                {evidence.length > 0 && (
                  <ul className="mt-2 text-body">
                    {evidence.map((ev) => (
                      <li key={ev.id} className="flex flex-wrap items-baseline gap-x-2 border-b border-row py-2">
                        {ev.url ? (
                          <a href={ev.url} target="_blank" rel="noreferrer" className="hover:underline">
                            {ev.title}
                          </a>
                        ) : (
                          ev.title
                        )}
                        <span className="text-caption text-muted-foreground">
                          {ev.publisher}
                          {ev.publishedAt ? ` · ${fmtDateTime(ev.publishedAt)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <section aria-labelledby="ref" className="mt-[30px] border-t pt-[18px]">
            <div className="flex items-baseline gap-3">
              <h2 id="ref" className={cn("flex-1 text-title font-bold tracking-[-0.01em]", !reported && "text-muted-foreground")}>
                3 · Post-earnings reflection
              </h2>
              {reported && e.status === "reviewed" && <span className="text-caption font-semibold text-muted-foreground">Reviewed {relativeTime(e.reflectionAt)}</span>}
            </div>
            {!reported ? (
              <p className="mt-1.5 text-body text-muted-foreground">Opens after the report. You write it; &ldquo;Get feedback&rdquo; asks Hoot to flag unsupported claims and gaps against your locked expectations.</p>
            ) : (
              <>
                <form className="flex flex-col">
                  <input type="hidden" name="id" value={e.id} />
                  <label className="mt-3.5 flex flex-col gap-1">
                    <span className="text-body font-semibold">What happened against what you expected</span>
                    <Textarea
                      name="reflection"
                      defaultValue={e.reflection ?? ""}
                      rows={8}
                      placeholder={"Which key questions were answered, which were not. Whether anything met your thesis-change criteria, and why."}
                      className={UNDERLINE}
                    />
                  </label>
                  <div className="mt-3.5 flex flex-wrap items-center gap-2">
                    {agentOn && (
                      <Button type="submit" formAction={requestEarningsFeedback} variant="secondary">
                        Get feedback
                      </Button>
                    )}
                    <Button type="submit" formAction={saveReflection} variant="secondary">
                      Save draft
                    </Button>
                    <span className="flex-1" />
                    <Button type="submit" formAction={markReviewed}>
                      Mark reviewed
                    </Button>
                  </div>
                </form>
                {e.feedback && (
                  <div className="mt-4">
                    <FeedbackPanel feedback={e.feedback} />
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <aside aria-label="Prep pack and timeline" className="flex w-[300px] shrink-0 flex-col">
          <h2 className="flex items-center gap-2 text-body font-bold">
            <OwlMark className="size-5 rounded-full" />
            Prep pack
          </h2>
          <p className="mt-1.5 text-body text-ink-3">
            {e.prepPack
              ? `Built ${relativeTime(e.prepPack.builtAt)}: last quarter's numbers, guidance, what changed in filings and the sell-side, and questions to watch. All cited.`
              : reported
                ? "No prep pack was built before this report."
                : e.prepPackError
                ? `Hoot could not build the evidence pack yet (${e.prepPackError.replace(/^attempt \d+: /, "").slice(0, 140)}).`
                : `Builds ${fmtDayMonth(buildOn)}, a few trading days before the report: last quarter's numbers, guidance, what changed in filings and the sell-side, and questions to watch. All cited.`}
          </p>
          {e.prepPack && (
            <a href="#prep-pack" className="mt-2 w-fit text-caption font-semibold text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              Read the pack
            </a>
          )}
          {canBuild ? (
            <div className="mt-2.5">
              <PrepPackBuild id={e.id} rebuild={Boolean(e.prepPack)} recipients={recipients} />
              <span className="mt-1 block text-caption text-muted-foreground">Leads, execs and admins</span>
            </div>
          ) : (
            !reported && <span className="mt-1 text-caption text-muted-foreground">Leads, execs and admins can build it early</span>
          )}

          <h2 className="mt-7 mb-1 text-body font-bold">Timeline</h2>
          <ol>
            {timeline.map((t) => (
              <li key={t.t} className="grid grid-cols-[56px_minmax(0,1fr)] gap-2.5 border-b border-row py-2 text-body">
                <span className="text-caption text-muted-foreground">{t.d}</span>
                <span className={t.current ? "font-semibold" : "text-muted-foreground"}>{t.t}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}


const HOUR_WORD: Record<string, string> = { bmo: "before open", amc: "after close", dmh: "during market hours" };
const days = (from: string, to: string) => Math.round(DateTime.fromISO(to, { zone: NY }).diff(DateTime.fromISO(from, { zone: NY }), "days").days);

/** "In 31 days", "Tomorrow", "Today", "Reported 3 days ago": how far the report is, as the page's one big number. */
function untilReport(reportDate: string, today: string): string {
  const n = days(today, reportDate);
  if (n > 1) return `In ${n} days`;
  if (n === 1) return "Tomorrow";
  if (n === 0) return "Today";
  return `Reported ${-n} ${-n === 1 ? "day" : "days"} ago`;
}

const RESULTS_GRID = "grid grid-cols-[minmax(0,1.4fr)_90px_90px_90px_90px_minmax(0,1fr)] items-center gap-3";
/** The spec's fields: a line under the words, no box. */
const UNDERLINE = "min-h-0 rounded-none border-0 border-b border-border-strong bg-transparent px-0 py-1.5 text-emph shadow-none focus-visible:border-foreground";

function Field({ label, name, value, rows, placeholder }: { label: string; name: string; value: string | null; rows: number; placeholder: string }) {
  return (
    <label className="mt-3.5 flex flex-col gap-1">
      <span className="text-body font-semibold">{label}</span>
      <Textarea id={name} name={name} defaultValue={value ?? ""} rows={rows} placeholder={placeholder} className={UNDERLINE} />
    </label>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3.5">
      <dt className="text-body font-semibold">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-emph text-foreground">{children || <span className="text-muted-foreground">(not recorded)</span>}</dd>
    </div>
  );
}

/** A figure from the release, or the word "missing" in amber where the extraction found none. */
function Figure({ v }: { v: string | null }) {
  return v ? (
    <span role="cell" className="text-right">
      {v}
    </span>
  ) : (
    <span role="cell" className="text-right font-semibold text-caution-foreground">
      missing
    </span>
  );
}
