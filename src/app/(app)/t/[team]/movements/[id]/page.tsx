import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { loadTeam } from "@/lib/teams";
import { getMovement, listEvidence } from "@/lib/movements";
import { listTeamMembers } from "@/lib/holdings";
import { claimMovement, completeMovement, reopenMovement, requestMovementFeedback, rerunEvidence, saveMovementUpdate } from "@/lib/actions/movements";
import { FeedbackPanel } from "@/components/app/feedback-panel";
import { agentConfigured } from "@/lib/agent/model";
import { canManageTeam } from "@/lib/auth";
import { fmtDate, fmtDateTime, relativeTime } from "@/lib/format";
import { MOVEMENT_THRESHOLD_PP } from "@/lib/constants";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { Move } from "@/components/app/move";
import { StatusBadge } from "@/components/app/status-badge";
import { NativeSelect } from "@/components/app/native-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Movement" };

const KIND_LABEL: Record<string, string> = { news: "News", filing: "SEC filings", peer_move: "Peer moves (same session)", financial: "Calendar", price: "Prices", release: "Company release" };

export default async function MovementPage({ params }: { params: Promise<{ team: string; id: string }> }) {
  const { team: slug, id } = await params;
  const { team, user } = await loadTeam(slug);
  const row = await getMovement(id);
  if (!row || row.h.teamId !== team.id) notFound();
  const { m, h, ownerName } = row;
  const [evidence, members] = await Promise.all([listEvidence(m.id), listTeamMembers(team.id)]);
  const manage = canManageTeam(user, team.id);
  const grouped = new Map<string, typeof evidence>();
  for (const e of evidence) grouped.set(e.kind, [...(grouped.get(e.kind) ?? []), e]);
  const completed = m.status === "completed";

  return (
    <>
      <div className="mb-3">
        <Button nativeButton={false} render={<Link href={`/t/${team.slug}/movements`} />} variant="ghost" size="sm">
          <ArrowLeft />
          Movements
        </Button>
      </div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <Link href={`/t/${team.slug}/h/${h.ticker}`} className="hover:underline">{h.ticker}</Link>
            <span className="text-base font-normal text-muted-foreground">{fmtDate(m.sessionDate)} session</span>
            <StatusBadge status={m.status} dueAt={m.dueAt} />
          </span>
        }
        description={`${h.companyName}. Due ${fmtDateTime(m.dueAt)}.`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          <Card className="p-4">
            <SectionTitle aside="Official closes · Yahoo Finance">The move</SectionTitle>
            {m.dataQuality ? (
              <p className="text-sm text-warning-foreground">Data quality problem: {m.dataQuality}. No calculation was made; resolve the data issue and re-run the close check.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label={`${h.ticker} return`}><Move value={m.holdingReturnPct} unit="%" digits={2} className="text-xl font-semibold" /></Stat>
                <Stat label="S&P 500 return"><Move value={m.spxReturnPct} unit="%" digits={2} className="text-xl font-semibold" /></Stat>
                <Stat label={`Relative (rule ≥ ${MOVEMENT_THRESHOLD_PP} pp)`}><Move value={m.relativeMovePp} unit=" pp" className="text-xl font-semibold" /></Stat>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <SectionTitle aside={completed ? `Completed ${relativeTime(m.completedAt)}` : "Your words. The agent never drafts this."}>Major-movement update</SectionTitle>
            {completed ? (
              <>
                <p className="text-sm whitespace-pre-wrap">{m.updateText}</p>
                <form action={reopenMovement} className="mt-3">
                  <input type="hidden" name="id" value={m.id} />
                  <Button type="submit" size="sm" variant="outline">Reopen</Button>
                </form>
              </>
            ) : (
              <form className="grid gap-2">
                <input type="hidden" name="id" value={m.id} />
                <Textarea name="updateText" defaultValue={m.updateText ?? ""} rows={10} placeholder={"What happened, what the evidence supports, what remains unexplained, and what it means for the thesis.\n\nCite the sources you relied on."} />
                <div className="flex flex-wrap justify-end gap-2">
                  {agentConfigured() && (
                    <Button type="submit" formAction={requestMovementFeedback} size="sm" variant="outline" title="The agent flags unsupported claims, missing evidence, alternatives, and thesis contradictions. It never rewrites.">
                      Get feedback
                    </Button>
                  )}
                  <Button type="submit" formAction={saveMovementUpdate} size="sm" variant="outline">Save draft</Button>
                  <Button type="submit" formAction={completeMovement} size="sm">Mark complete</Button>
                </div>
                <p className="text-xs text-muted-foreground">Completing records your name and time. Send the email to the Fund separately; this workspace keeps the record.</p>
              </form>
            )}
          </Card>

          {m.feedback && <FeedbackPanel feedback={m.feedback} />}
        </div>

        <div className="min-w-0 space-y-6">
          <Card className="p-4">
            <SectionTitle>Owner</SectionTitle>
            <form action={claimMovement} className="flex items-center gap-2">
              <input type="hidden" name="id" value={m.id} />
              <NativeSelect name="ownerId" defaultValue={m.ownerId ?? ""} disabled={!manage && m.ownerId !== null && m.ownerId !== user.id}>
                <option value="">Unassigned</option>
                {members.map((mm) => (
                  <option key={mm.id} value={mm.id}>{mm.fullName}</option>
                ))}
              </NativeSelect>
              <Button type="submit" size="sm" variant="outline">Save</Button>
            </form>
            {!ownerName && <p className="mt-2 text-xs text-warning-foreground">Unassigned. Claim it or ask the lead.</p>}
          </Card>

          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Evidence <span className="text-muted-foreground">{evidence.length}</span></h2>
              <form action={rerunEvidence}>
                <input type="hidden" name="id" value={m.id} />
                <Button type="submit" size="xs" variant="ghost" title="Re-gather news, filings, and peer moves">
                  <RefreshCw />
                  Refresh
                </Button>
              </form>
            </div>
            {m.evidenceStatus === "pending" && evidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">Evidence is still being gathered. Refresh in a moment.</p>
            ) : evidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing found in the window. That is a finding too: say so in the update.</p>
            ) : (
              <div className="space-y-4">
                {[...grouped.entries()].map(([kind, items]) => (
                  <div key={kind}>
                    <div className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{KIND_LABEL[kind] ?? kind}</div>
                    <ul className="space-y-1.5">
                      {items.map((e) => (
                        <li key={e.id} className="text-sm">
                          {e.url ? (
                            <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline">{e.title}</a>
                          ) : (
                            <span>{e.title}</span>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {e.publisher}
                            {e.publishedAt ? ` · ${fmtDateTime(e.publishedAt)}` : ""}
                            {(e.payload as { error?: boolean })?.error && <Badge variant="outline" className="ml-1.5 text-down">lookup failed</Badge>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Evidence proximity is not causation. Open the agent to dig into any item.</p>
            <Button nativeButton={false} render={<Link href={`/t/${team.slug}/agent`} />} size="sm" variant="outline" className="mt-2">
              Ask the agent about {h.ticker}
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border px-2 py-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
