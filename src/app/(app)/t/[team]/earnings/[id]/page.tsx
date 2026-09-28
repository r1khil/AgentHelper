import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, RefreshCw } from "lucide-react";
import { itemTeam, loadScope } from "@/lib/teams";
import { holdingHref } from "@/lib/scope";
import { getEarnings, listEarningsEvidence, type Actuals } from "@/lib/earnings";
import { gatherResults, lockChecklist, markReviewed, rebuildPrepPack, requestEarningsFeedback, saveChecklist, saveReflection } from "@/lib/actions/earnings";
import { canManageTeam } from "@/lib/auth";
import { PrepPackCard } from "@/components/app/agent/prep-pack-card";
import { agentConfigured } from "@/lib/agent/model";
import { fmtCurrency, fmtDateTime, fmtDay, relativeTime } from "@/lib/format";
import { todayNY } from "@/lib/providers/calendar";
import { Panel, Pill } from "@/components/app/panel";
import { StatusBadge } from "@/components/app/status-badge";
import { FeedbackPanel } from "@/components/app/feedback-panel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Earnings" };

export default async function EarningsDetail({ params, searchParams }: { params: Promise<{ team: string; id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ team: slug, id }, { error }] = await Promise.all([params, searchParams]);
  // The fund scope shows any team's report; a team scope only its own.
  const scope = await loadScope(slug);
  const { user } = scope;
  const row = await getEarnings(id);
  if (!row) notFound();
  const team = itemTeam(scope, row.h.teamId);
  const { e, h } = row;
  const evidence = await listEarningsEvidence(e.id);
  const actuals = e.actuals as Actuals | null;
  const locked = Boolean(e.preLockedAt);
  const reported = e.reportDate <= todayNY();
  const sourceById = new Map((actuals?.sources ?? []).map((s) => [s.id, s]));
  const canManage = canManageTeam(user, team.id);
  const rebuild = canManage && !reported && agentConfigured() ? (
    <form action={rebuildPrepPack}>
      <input type="hidden" name="id" value={e.id} />
      <Button type="submit" size="sm" variant="outline" title="Gather the evidence again with the agent (one model run)">
        <RefreshCw />
        {e.prepPack ? "Rebuild" : "Build prep pack"}
      </Button>
    </form>
  ) : null;

  const header = (label: React.ReactNode, aside?: React.ReactNode) => (
    <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b px-4 py-1.5">
      <h2 className="text-[14.5px] font-semibold">{label}</h2>
      <span className="flex-1" />
      {aside && <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">{aside}</div>}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-col gap-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Link href={`/t/${scope.slug}/earnings`} className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="size-3.5" />
            Calendar
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground">{h.ticker} earnings</span>
        </nav>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href={holdingHref(scope.slug, team.slug, h.ticker)} className="font-mono text-[28px] leading-none font-semibold tracking-[-0.02em] hover:underline">
            {h.ticker}
          </Link>
          <span className="text-[15px] text-ink-2">{h.companyName}</span>
          <span className="font-mono text-[13px] text-muted-foreground">
            {e.fiscalPeriod ?? "Earnings"} · {fmtDay(e.reportDate)}
            {e.reportHour ? ` ${e.reportHour.toUpperCase()}` : ""}
          </span>
          <Pill tone={e.dateStatus === "estimated" ? "caution" : "neutral"}>{e.dateStatus} date</Pill>
          <StatusBadge status={e.status} />
        </div>
        {(e.epsEstimate || e.revenueEstimate) && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
            {e.epsEstimate && (
              <span>
                Consensus EPS <span className="font-mono text-foreground">{fmtCurrency(e.epsEstimate, e.epsCurrency)}</span>
              </span>
            )}
            {e.revenueEstimate && (
              <span>
                Consensus revenue <span className="font-mono text-foreground">{fmtCurrency(e.revenueEstimate, e.revenueCurrency, { scale: 1e9, suffix: "B" })}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {error && <div className="rounded-[10px] bg-down/10 px-3.5 py-2.5 text-[13px] text-down">{error}</div>}
      {e.prepPack ? (
        <PrepPackCard pack={e.prepPack} actions={rebuild} />
      ) : !reported ? (
        <Panel className="flex-row flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px] text-muted-foreground">
          <span className="min-w-0 flex-1">
            {e.prepPackError ? `The agent could not build the evidence pack yet (${e.prepPackError.replace(/^attempt \d+: /, "").slice(0, 140)}).` : "The agent builds a sourced evidence pack (last quarter, guidance on record, consensus, the team's questions, items to watch) a few trading days before the report."}
          </span>
          {rebuild}
        </Panel>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-2">
        <Panel>
          {header(
            <span className="inline-flex items-center gap-1.5">
              {locked && <Lock className="size-3.5" />} Before the report: your expectations
            </span>,
            locked ? <Pill tone="good">Locked {relativeTime(e.preLockedAt)}</Pill> : "Locks automatically on the report date",
          )}
          <div className="flex flex-1 flex-col p-4">
            {locked ? (
              <dl className="space-y-4 text-[14px] leading-[1.55]">
                <Item label="What you expect">{e.expectations}</Item>
                <Item label="Key questions">{e.keyQuestions}</Item>
                <Item label="What would change the thesis">{e.thesisChangeCriteria}</Item>
              </dl>
            ) : (
              <form className="grid gap-3">
                <input type="hidden" name="id" value={e.id} />
                <Field label="What you expect (revenue, margins, guidance, the narrative)" name="expectations" value={e.expectations} />
                <Field label="Key questions for the call and release" name="keyQuestions" value={e.keyQuestions} />
                <Field label="What result would change the thesis" name="thesisChangeCriteria" value={e.thesisChangeCriteria} />
                <div className="flex justify-end gap-2">
                  <Button type="submit" formAction={saveChecklist} size="sm" variant="outline">
                    Save
                  </Button>
                  <Button type="submit" formAction={lockChecklist} size="sm">
                    <Lock />
                    Lock expectations
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Locking preserves your view so you can revisit it honestly afterwards. The agent reads it only to give feedback.</p>
              </form>
            )}
          </div>
        </Panel>

        <Panel>
          {header(
            "After the report: sourced results",
            <form action={gatherResults}>
              <input type="hidden" name="id" value={e.id} />
              <Button type="submit" size="sm" variant="outline" disabled={!reported} title={reported ? "Pull the 8-K, press release, and reported figures" : "Available on the report date"}>
                <RefreshCw />
                {actuals ? "Refresh" : "Gather results"}
              </Button>
            </form>,
          )}
          <div className="flex flex-1 flex-col">
            {!reported ? (
              <p className="p-4 text-[13.5px] text-muted-foreground">Results can be gathered from {fmtDay(e.reportDate)}. The morning sweep also does this automatically.</p>
            ) : !actuals ? (
              <p className="p-4 text-[13.5px] text-muted-foreground">Not gathered yet. Click &ldquo;Gather results&rdquo; to pull the 8-K and press release from EDGAR.</p>
            ) : (
              <>
                {actuals.rows.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Metric</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Prior year</TableHead>
                        <TableHead className="text-right">Prior guidance</TableHead>
                        <TableHead className="text-right">Estimate</TableHead>
                        <TableHead className="pr-4">Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {actuals.rows.map((r, i) => {
                        const src = r.sourceId ? sourceById.get(r.sourceId) : undefined;
                        return (
                          <TableRow key={i}>
                            <TableCell className="pl-4 font-medium">
                              {r.metric}
                              {r.note ? <span className="block text-xs font-normal text-muted-foreground">{r.note}</span> : null}
                            </TableCell>
                            <TableCell className="text-right font-mono text-[12.5px]">{r.actual ?? <Missing />}</TableCell>
                            <TableCell className="text-right font-mono text-[12.5px]">{r.priorYear ?? <Missing />}</TableCell>
                            <TableCell className="text-right font-mono text-[12.5px]">{r.priorGuidance ?? <Missing />}</TableCell>
                            <TableCell className="text-right font-mono text-[12.5px]">{r.estimate ?? <Missing />}</TableCell>
                            <TableCell className="pr-4 font-mono text-xs">
                              {src ? (
                                <a href={src.url} target="_blank" rel="noreferrer" className="hover:underline">
                                  {src.id}
                                </a>
                              ) : (
                                <span className="text-down">none</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="px-4 pt-4 text-[13.5px] text-muted-foreground">No figures could be extracted yet.</p>
                )}
                <div className="px-4 pt-3 pb-4">
                  {actuals.missing.length > 0 && (
                    <ul className="mb-3 list-disc space-y-0.5 pl-5 text-xs text-caution-foreground">
                      {actuals.missing.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-muted-foreground">Extracted {relativeTime(actuals.extractedAt)} from the sources below. Check every number against the release before relying on it.</p>
                </div>
                {evidence.length > 0 && (
                  <ul className="border-t border-row text-[13.5px]">
                    {evidence.map((ev) => (
                      <li key={ev.id} className="flex flex-wrap items-baseline gap-x-2 border-b border-row px-4 py-2 last:border-b-0">
                        {ev.url ? (
                          <a href={ev.url} target="_blank" rel="noreferrer" className="hover:underline">
                            {ev.title}
                          </a>
                        ) : (
                          ev.title
                        )}
                        <span className="text-xs text-muted-foreground">
                          {ev.publisher}
                          {ev.publishedAt ? <span className="font-mono"> · {fmtDateTime(ev.publishedAt)}</span> : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </Panel>
      </div>

      {reported && (
        <Panel>
          {header("Post-earnings reflection", e.status === "reviewed" ? <Pill tone="good">Reviewed {relativeTime(e.reflectionAt)}</Pill> : "Against your locked expectations")}
          <div className="p-4">
            <form className="grid gap-2">
              <input type="hidden" name="id" value={e.id} />
              <Textarea name="reflection" defaultValue={e.reflection ?? ""} rows={8} placeholder={"What happened versus what you expected. Which key questions were answered, which were not. Whether anything met your thesis-change criteria, and why."} />
              <div className="flex flex-wrap justify-end gap-2">
                {agentConfigured() && (
                  <Button type="submit" formAction={requestEarningsFeedback} size="sm" variant="outline">
                    Get feedback
                  </Button>
                )}
                <Button type="submit" formAction={saveReflection} size="sm" variant="outline">
                  Save draft
                </Button>
                <Button type="submit" formAction={markReviewed} size="sm">
                  Mark reviewed
                </Button>
              </div>
            </form>
            {e.feedback && (
              <div className="mt-3">
                <FeedbackPanel feedback={e.feedback} />
              </div>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}

function Field({ label, name, value }: { label: string; name: string; value: string | null }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Textarea id={name} name={name} defaultValue={value ?? ""} rows={3} />
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label-mono text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{children || <span className="text-muted-foreground">(not recorded)</span>}</dd>
    </div>
  );
}

function Missing() {
  return <span className="text-xs text-muted-foreground">missing</span>;
}
