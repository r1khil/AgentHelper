import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, RefreshCw } from "lucide-react";
import { loadTeam } from "@/lib/teams";
import { getEarnings, listEarningsEvidence, type Actuals } from "@/lib/earnings";
import { gatherResults, lockChecklist, markReviewed, requestEarningsFeedback, saveChecklist, saveReflection } from "@/lib/actions/earnings";
import { agentConfigured } from "@/lib/agent/model";
import { fmtDate, fmtDateTime, fmtMoney, relativeTime } from "@/lib/format";
import { todayNY } from "@/lib/providers/calendar";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { FeedbackPanel } from "@/components/app/feedback-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Earnings" };

export default async function EarningsDetail({ params }: { params: Promise<{ team: string; id: string }> }) {
  const { team: slug, id } = await params;
  const { team } = await loadTeam(slug);
  const row = await getEarnings(id);
  if (!row || row.h.teamId !== team.id) notFound();
  const { e, h } = row;
  const evidence = await listEarningsEvidence(e.id);
  const actuals = e.actuals as Actuals | null;
  const locked = Boolean(e.preLockedAt);
  const reported = e.reportDate <= todayNY();
  const sourceById = new Map((actuals?.sources ?? []).map((s) => [s.id, s]));

  return (
    <>
      <div className="mb-3">
        <Button nativeButton={false} render={<Link href={`/t/${team.slug}/earnings`} />} variant="ghost" size="sm">
          <ArrowLeft />
          Earnings
        </Button>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Link href={`/t/${team.slug}/h/${h.ticker}`} className="hover:underline">{h.ticker}</Link>
            <span className="text-base font-normal text-muted-foreground">{e.fiscalPeriod ?? "Earnings"} · {fmtDate(e.reportDate)}{e.reportHour ? ` ${e.reportHour.toUpperCase()}` : ""}</span>
            <Badge variant="outline">{e.dateStatus} date</Badge>
            <StatusBadge status={e.status} />
          </span>
        }
        description={
          <>
            {h.companyName}. {e.epsEstimate ? `Consensus EPS ${fmtMoney(e.epsEstimate)}.` : ""} {e.revenueEstimate ? `Consensus revenue ${fmtMoney(Number(e.revenueEstimate) / 1e9, 2)}B.` : ""}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <SectionTitle aside={locked ? `Locked ${relativeTime(e.preLockedAt)}` : "Locks automatically on the report date"}>
            <span className="inline-flex items-center gap-1.5">{locked && <Lock className="size-3.5" />} Before the report: your expectations</span>
          </SectionTitle>
          {locked ? (
            <dl className="space-y-3 text-sm">
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
                <Button type="submit" formAction={saveChecklist} size="sm" variant="outline">Save</Button>
                <Button type="submit" formAction={lockChecklist} size="sm">
                  <Lock />
                  Lock expectations
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Locking preserves your view so you can revisit it honestly afterwards. The agent reads it only to give feedback.</p>
            </form>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">After the report: sourced results</h2>
            <form action={gatherResults}>
              <input type="hidden" name="id" value={e.id} />
              <Button type="submit" size="xs" variant="ghost" disabled={!reported} title={reported ? "Pull the 8-K, press release, and XBRL facts" : "Available on the report date"}>
                <RefreshCw />
                {actuals ? "Refresh" : "Gather results"}
              </Button>
            </form>
          </div>
          {!reported ? (
            <p className="text-sm text-muted-foreground">Results can be gathered from {fmtDate(e.reportDate)}. The morning sweep also does this automatically.</p>
          ) : !actuals ? (
            <p className="text-sm text-muted-foreground">Not gathered yet. Click &ldquo;Gather results&rdquo; to pull the 8-K and press release from EDGAR.</p>
          ) : (
            <>
              {actuals.rows.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Prior year</TableHead>
                      <TableHead className="text-right">Prior guidance</TableHead>
                      <TableHead className="text-right">Estimate</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {actuals.rows.map((r, i) => {
                      const s = r.sourceId ? sourceById.get(r.sourceId) : undefined;
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{r.metric}{r.note ? <span className="block text-xs font-normal text-muted-foreground">{r.note}</span> : null}</TableCell>
                          <TableCell className="tnum text-right">{r.actual ?? <Missing />}</TableCell>
                          <TableCell className="tnum text-right">{r.priorYear ?? <Missing />}</TableCell>
                          <TableCell className="tnum text-right">{r.priorGuidance ?? <Missing />}</TableCell>
                          <TableCell className="tnum text-right">{r.estimate ?? <Missing />}</TableCell>
                          <TableCell className="text-xs">{s ? <a href={s.url} target="_blank" rel="noreferrer" className="hover:underline">{s.id}</a> : <span className="text-down">none</span>}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No figures could be extracted yet.</p>
              )}
              {actuals.missing.length > 0 && (
                <ul className="mt-3 list-disc space-y-0.5 pl-5 text-xs text-warning-foreground">
                  {actuals.missing.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Extracted {relativeTime(actuals.extractedAt)} from the sources below. Check every number against the release before relying on it.</p>
              {evidence.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t pt-3 text-sm">
                  {evidence.map((ev) => (
                    <li key={ev.id}>
                      {ev.url ? <a href={ev.url} target="_blank" rel="noreferrer" className="hover:underline">{ev.title}</a> : ev.title}
                      <span className="ml-1.5 text-xs text-muted-foreground">{ev.publisher}{ev.publishedAt ? ` · ${fmtDateTime(ev.publishedAt)}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>

      {reported && (
        <Card className="mt-6 p-4">
          <SectionTitle aside={e.status === "reviewed" ? `Reviewed ${relativeTime(e.reflectionAt)}` : "Your words, against your locked expectations"}>Post-earnings reflection</SectionTitle>
          <form className="grid gap-2">
            <input type="hidden" name="id" value={e.id} />
            <Textarea name="reflection" defaultValue={e.reflection ?? ""} rows={8} placeholder={"What happened versus what you expected. Which key questions were answered, which were not. Whether anything met your thesis-change criteria, and why."} />
            <div className="flex flex-wrap justify-end gap-2">
              {agentConfigured() && (
                <Button type="submit" formAction={requestEarningsFeedback} size="sm" variant="outline">Get feedback</Button>
              )}
              <Button type="submit" formAction={saveReflection} size="sm" variant="outline">Save draft</Button>
              <Button type="submit" formAction={markReviewed} size="sm">Mark reviewed</Button>
            </div>
          </form>
          {e.feedback && <div className="mt-3"><FeedbackPanel feedback={e.feedback} /></div>}
        </Card>
      )}
    </>
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
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{children || <span className="text-muted-foreground">(not recorded)</span>}</dd>
    </div>
  );
}

function Missing() {
  return <span className="text-xs text-muted-foreground">missing</span>;
}
