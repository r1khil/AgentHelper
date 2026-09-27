import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { completeMovement, reopenMovement, requestMovementFeedback, rerunEvidence, saveMovementUpdate } from "@/lib/actions/movements";
import { MOVEMENT_THRESHOLD_PP } from "@/lib/constants";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader, Pill } from "@/components/app/panel";
import { Move } from "@/components/app/move";
import { FeedbackPanel } from "@/components/app/feedback-panel";
import { HootMoodFor } from "@/components/app/hoot/presence";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OwnerPicker } from "./owner-picker";
import { dueLabel, firstName, gatheredAt, movementPill, overdueLabel, sessionLong, sessionShort, wordCount } from "./format";
import type { MovementDetailData, MovementEvidence, MovementListItem } from "./types";

const KIND_LABEL: Record<string, string> = { news: "News", filing: "SEC filing", peer_move: "Peer move, same session", financial: "Calendar", price: "Prices", release: "Company release" };

/**
 * Movements as master–detail: the list on the left, the selected movement on the right. Rendered by both
 * /movements (most relevant item selected) and /movements/[id].
 */
export function MovementsView({ items, selected }: { items: MovementListItem[]; selected: MovementDetailData | null }) {
  const anyOverdue = items.some((i) => i.overdue) || !!selected?.overdue;
  return (
    <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      {anyOverdue && <HootMoodFor mood="concerned" />}
      <MovementList items={items} selectedId={selected?.id ?? null} />
      {selected ? (
        <MovementDetail d={selected} />
      ) : (
        <div className="flex min-h-64 items-center justify-center rounded-[14px] border border-dashed text-sm text-muted-foreground">Select a movement to see its evidence and write-up.</div>
      )}
    </div>
  );
}

function MovementList({ items, selectedId }: { items: MovementListItem[]; selectedId: string | null }) {
  const open = items.filter((i) => i.status !== "completed").length;
  return (
    <Panel className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6.5rem)]">
      <div className="shrink-0 border-b px-4 py-3.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[14.5px] font-semibold">Movements</h2>
          <span className="flex-1" />
          <span className="font-mono text-[11px] text-muted-foreground">
            {open} open · {items.length - open} completed
          </span>
        </div>
        <p className="mt-0.5 text-[12.5px] leading-[1.45] text-muted-foreground">
          Opened when a holding&apos;s daily return differs from the S&amp;P 500&apos;s by {MOVEMENT_THRESHOLD_PP} pp or more. Due noon the next trading day. Checked nightly after the close.
        </p>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {items.map((i) => {
          const pill = movementPill(i.status, i.overdue);
          const on = i.id === selectedId;
          return (
            <li key={i.id}>
              <Link
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "block border-b border-row px-4 py-2.5 transition-colors hover:bg-band focus-visible:bg-band focus-visible:outline-none",
                  on && "bg-band shadow-[inset_3px_0_0_var(--foreground)]",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="w-11 shrink-0 font-mono text-[13px] font-semibold">{i.ticker}</span>
                  {i.dataQuality ? (
                    <span className="truncate text-[12.5px] text-caution-foreground" title={i.dataQuality}>
                      Data problem
                    </span>
                  ) : (
                    <Move value={i.relativePp} unit=" pp" className="text-[13px]" />
                  )}
                  <span className="flex-1" />
                  <Pill tone={pill.tone}>{pill.label}</Pill>
                </div>
                <div className="mt-[3px] truncate text-xs text-muted-foreground">
                  {sessionShort(i.sessionDate)} · {i.ownerName ?? <span className="text-caution-foreground">Unassigned</span>}
                  {i.teamName && ` · ${i.teamName}`}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function MovementDetail({ d }: { d: MovementDetailData }) {
  const completed = d.status === "completed";
  const owner = firstName(d.ownerName);
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Link href={d.holdingHref} className="font-mono text-2xl font-semibold hover:underline">
              {d.ticker}
            </Link>
            <span className="text-[15px] text-ink-2">
              {sessionLong(d.sessionDate)}
              <span className="text-muted-foreground"> · {d.companyName}</span>
            </span>
          </div>
          {d.dataQuality ? (
            <p className="mt-1 text-[13.5px] text-caution-foreground">
              Data quality problem: {d.dataQuality}. No calculation was made; resolve the data issue and re-run the close check.
            </p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-ink-2" title={`Official closes · Yahoo Finance. Rule: relative move of ${MOVEMENT_THRESHOLD_PP} pp or more.`}>
              <span>
                {d.ticker} <Move value={d.holdingReturnPct} unit="%" digits={2} />
              </span>
              <span>
                S&amp;P 500 <Move value={d.spxReturnPct} unit="%" digits={2} />
              </span>
              <span>
                Relative <Move value={d.relativePp} unit=" pp" className="font-semibold" />
              </span>
            </div>
          )}
        </div>
        <MetaStrip d={d} />
      </div>

      <div className="grid flex-1 gap-5 xl:grid-cols-2">
        <EvidencePanel d={d} owner={owner} />
        <div className="flex min-w-0 flex-col gap-5">
          <Panel className="shrink-0">
            <PanelHeader
              title={owner ? `${owner}'s update` : "Update"}
              aside={completed ? `Completed ${relativeTime(d.completedAt)}` : d.updateText?.trim() ? `Draft · ${wordCount(d.updateText)} words` : "Not started"}
            />
            {completed ? (
              <div className="px-4 py-3.5">
                <p className="text-[14.5px] leading-[1.6] whitespace-pre-wrap">{d.updateText}</p>
                <form action={reopenMovement} className="mt-3">
                  <input type="hidden" name="id" value={d.id} />
                  <Button type="submit" variant="outline">
                    Reopen
                  </Button>
                </form>
              </div>
            ) : (
              <form className="flex flex-col gap-3 px-4 pt-2 pb-3.5">
                <input type="hidden" name="id" value={d.id} />
                <Textarea
                  name="updateText"
                  defaultValue={d.updateText ?? ""}
                  rows={7}
                  aria-label="Your update"
                  placeholder={"What happened, what the evidence supports, what remains unexplained, and what it means for the thesis.\n\nCite the sources you relied on."}
                  className="-mx-2.5 w-[calc(100%+1.25rem)] resize-y border-transparent bg-transparent py-1.5 text-[14.5px] leading-[1.6] hover:bg-band focus-visible:bg-card md:text-[14.5px]"
                />
                <div className="flex flex-wrap items-center gap-2">
                  {d.agentConfigured && (
                    <Button
                      type="submit"
                      formAction={requestMovementFeedback}
                      variant="outline"
                      title="Hoot flags unsupported claims, missing evidence, alternatives, and thesis contradictions. He never rewrites."
                    >
                      Ask Hoot for feedback
                    </Button>
                  )}
                  <Button type="submit" formAction={saveMovementUpdate} variant="outline">
                    Save draft
                  </Button>
                  <Button type="submit" formAction={completeMovement}>
                    Mark complete
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Your words; Hoot never drafts this. Completing records your name and time. Email the Fund separately; this keeps the record.
                </p>
              </form>
            )}
          </Panel>
          {d.feedback && <FeedbackPanel feedback={d.feedback} currentText={d.updateText} className="flex-1" />}
        </div>
      </div>
    </div>
  );
}

function MetaStrip({ d }: { d: MovementDetailData }) {
  const status = d.overdue ? (
    <span className="text-hoot-foreground">{overdueLabel(d.dueAt)}</span>
  ) : d.status === "completed" ? (
    <span className="text-good-foreground">Completed</span>
  ) : d.status === "in_progress" ? (
    <span className="text-caution-foreground">In progress</span>
  ) : (
    "Open"
  );
  const cells: { k: string; v: React.ReactNode }[] = [
    { k: "Owner", v: <OwnerPicker movementId={d.id} ownerId={d.ownerId} ownerName={d.ownerName} members={d.members} locked={d.ownerLocked} /> },
    { k: d.leadNames.length > 1 ? "Leads" : "Lead", v: d.leadNames.length ? d.leadNames.join(", ") : <span className="text-muted-foreground">—</span> },
    { k: "Due", v: dueLabel(d.dueAt) },
    { k: "Status", v: status },
  ];
  return (
    <div className="panel flex shrink-0 overflow-visible">
      {cells.map((c, i) => (
        <div key={c.k} className={cn("px-4 py-2", i > 0 && "shadow-[inset_1px_0_0_var(--border)]")}>
          <div className="text-[11.5px] text-muted-foreground">{c.k}</div>
          <div className="text-[13.5px] font-semibold whitespace-nowrap">{c.v}</div>
        </div>
      ))}
    </div>
  );
}

function EvidencePanel({ d, owner }: { d: MovementDetailData; owner: string | null }) {
  // Grouped by kind (news, filings, peers, …) in the order each kind first appears, then numbered.
  const groups = new Map<string, MovementEvidence[]>();
  for (const e of d.evidence) groups.set(e.kind, [...(groups.get(e.kind) ?? []), e]);
  const ordered = [...groups.values()].flat();
  const latest = d.evidence.reduce<Date | null>((a, e) => (!a || e.retrievedAt > a ? e.retrievedAt : a), null);
  return (
    <Panel>
      <PanelHeader
        title="Evidence Hoot gathered"
        aside={
          <>
            <span>
              {d.evidence.length} source{d.evidence.length === 1 ? "" : "s"}
              {latest && ` · ${gatheredAt(latest)}`}
            </span>
            <form action={rerunEvidence}>
              <input type="hidden" name="id" value={d.id} />
              <Button type="submit" size="icon-xs" variant="ghost" title="Re-gather news, filings, and peer moves" aria-label="Re-gather evidence">
                <RefreshCw />
              </Button>
            </form>
          </>
        }
      />
      {d.evidenceStatus === "pending" && d.evidence.length === 0 ? (
        <p className="flex-1 px-4 py-3 text-[13.5px] text-muted-foreground">Evidence is still being gathered. Refresh in a moment.</p>
      ) : d.evidence.length === 0 ? (
        <p className="flex-1 px-4 py-3 text-[13.5px] text-muted-foreground">Nothing found in the window. That is a finding too: say so in the update.</p>
      ) : (
        <ol className="flex flex-1 flex-col">
          {ordered.map((e, i) => (
            <li key={e.id} className="flex flex-1 gap-3 border-b border-row px-4 py-2.5">
              <span className="mt-px grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-hoot px-1 font-mono text-[10.5px] font-medium text-hoot-foreground">{i + 1}</span>
              <div className="min-w-0">
                <div className="text-[13.5px] leading-[1.45]">
                  {e.url ? (
                    <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline">
                      {e.title}
                    </a>
                  ) : (
                    e.title
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {[KIND_LABEL[e.kind] ?? e.kind, e.publisher, e.publishedAt ? sessionShortDateTime(e.publishedAt) : null].filter(Boolean).join(" · ")}
                  {e.failed && <span className="ml-1.5 text-down">lookup failed</span>}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="flex shrink-0 items-center gap-3 bg-band-2 px-4 py-2.5 text-[12.5px] text-ink-2">
        <span className="min-w-0 flex-1">These are possible catalysts, not the explanation. The write-up is {owner ? `${owner}'s` : "the owner's"}.</span>
        <Button nativeButton={false} render={<Link href={d.askHootHref} />} size="sm" variant="outline">
          Ask Hoot about {d.ticker}
        </Button>
      </div>
    </Panel>
  );
}

/** "Sep 21, 6:04 pm" in New York time. */
function sessionShortDateTime(d: Date) {
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).replace(/ (AM|PM)$/, (m) => m.toLowerCase());
}
