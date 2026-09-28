import Link from "next/link";
import { MOVEMENT_THRESHOLD_PP } from "@/lib/constants";
import { fmtBp, ppToBp, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Panel, Pill } from "@/components/app/panel";
import { Move } from "@/components/app/move";
import { FeedbackPanel } from "@/components/app/feedback-panel";
import { HootMoodFor } from "@/components/app/hoot/presence";
import { MovementListPopover } from "./list-popover";
import { MovementWorkspace, type EvidenceRow } from "./workspace";
import { citationFor } from "./cite";
import { KIND_LABEL, dueLabel, gatheredAt, movementPill, overdueLabel, sessionLong, sessionShort, sessionShortDateTime, wordCount } from "./format";
import type { MovementDetailData, MovementEvidence, MovementListItem } from "./types";

/**
 * Movements as master–detail, filling the window: the list on the left, the selected movement on the right with
 * its write-up as the main column. Below xl the list folds into a button so the write-up keeps its width. Rendered
 * by both /movements (most relevant item selected) and /movements/[id].
 */
export function MovementsView({ items, selected }: { items: MovementListItem[]; selected: MovementDetailData | null }) {
  const anyOverdue = items.some((i) => i.overdue) || !!selected?.overdue;
  const list = (className?: string) => <MovementList items={items} selectedId={selected?.id ?? null} className={className} />;
  return (
    <div
      className={cn(
        "grid min-h-0 flex-1 gap-5 lg:h-[calc(100dvh-6.5rem)] lg:flex-none lg:grid-rows-[minmax(0,1fr)]",
        selected ? "xl:grid-cols-[320px_minmax(0,1fr)]" : "lg:grid-cols-[320px_minmax(0,1fr)]",
      )}
    >
      {anyOverdue && <HootMoodFor mood="concerned" />}
      {list(selected ? "hidden xl:flex" : undefined)}
      {selected ? (
        <MovementDetail d={selected} list={list("rounded-none shadow-none max-h-[min(70dvh,640px)]")} items={items} />
      ) : (
        <div className="flex min-h-64 items-center justify-center rounded-[14px] border border-dashed text-sm text-muted-foreground">Select a movement to see its evidence and write-up.</div>
      )}
    </div>
  );
}

function MovementList({ items, selectedId, className }: { items: MovementListItem[]; selectedId: string | null; className?: string }) {
  const open = items.filter((i) => i.status !== "completed").length;
  return (
    <Panel data-tour="movements-list" className={className}>
      <div className="shrink-0 border-b px-4 py-3.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[14.5px] font-semibold">Movements</h2>
          <span className="flex-1" />
          <span className="font-mono text-[11px] text-muted-foreground">
            {open} open · {items.length - open} completed
          </span>
        </div>
        <p className="mt-0.5 text-[12.5px] leading-[1.45] text-muted-foreground">
          Opened when a holding&apos;s daily return differs from the S&amp;P 500&apos;s by {fmtBp(MOVEMENT_THRESHOLD_PP * 100)} or more. Due noon the next trading day. Checked nightly after the close.
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
                    <Move value={ppToBp(i.relativePp)} unit=" bp" digits={0} className="text-[13px]" />
                  )}
                  <span className="flex-1" />
                  <Pill tone={pill.tone}>{pill.label}</Pill>
                </div>
                <div className="mt-[3px] truncate text-xs text-muted-foreground">
                  {sessionShort(i.sessionDate)}
                  {i.teamName && ` · ${i.teamName}`}
                  {i.completedByName && ` · by ${i.completedByName}`}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function MovementDetail({ d, list, items }: { d: MovementDetailData; list: React.ReactNode; items: MovementListItem[] }) {
  const open = items.filter((i) => i.status !== "completed").length;
  const status = d.status === "completed" ? `Completed ${relativeTime(d.completedAt)}${d.completedByName ? ` by ${d.completedByName}` : ""}` : d.updateText?.trim() ? `Draft · ${wordCount(d.updateText)} words` : "Not started";
  const latest = d.evidence.reduce<Date | null>((a, e) => (!a || e.retrievedAt > a ? e.retrievedAt : a), null);
  return (
    <div data-tour="movement-detail" className="flex min-h-0 min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-[22rem] items-center gap-4">
          <div className="shrink-0 xl:hidden">
            <MovementListPopover open={open} total={items.length}>
              {list}
            </MovementListPopover>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Link href={d.holdingHref} className="font-mono text-2xl font-semibold hover:underline">
                {d.ticker}
              </Link>
              <span className="text-[15px] text-ink-2">
                {sessionLong(d.sessionDate)}
                <span className="text-muted-foreground"> · {d.companyName}</span>
              </span>
              {!d.dataQuality && (
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-ink-2" title={`Official closes · Yahoo Finance. Rule: relative move of ${fmtBp(MOVEMENT_THRESHOLD_PP * 100)} or more.`}>
                  <span>
                    {d.ticker} <Move value={d.holdingReturnPct} unit="%" digits={2} />
                  </span>
                  <span>
                    S&amp;P 500 <Move value={d.spxReturnPct} unit="%" digits={2} />
                  </span>
                  <span>
                    Relative <Move value={ppToBp(d.relativePp)} unit=" bp" digits={0} className="font-semibold" />
                  </span>
                </span>
              )}
            </div>
            {d.dataQuality && (
              <p className="mt-1 text-[13.5px] text-caution-foreground">
                Data quality problem: {d.dataQuality}. No calculation was made; resolve the data issue and re-run the close check.
              </p>
            )}
          </div>
        </div>
        <MetaStrip d={d} />
      </div>
      <MovementWorkspace
        d={d}
        status={status}
        evidence={evidenceRows(d.evidence)}
        gathered={latest && gatheredAt(latest)}
        feedback={d.feedback && <FeedbackPanel feedback={d.feedback} currentText={d.updateText} className="shrink-0" />}
      />
    </div>
  );
}

/** The evidence grouped by kind (news, filings, peers, …) in the order each kind first appears, then numbered. */
function evidenceRows(evidence: MovementEvidence[]): EvidenceRow[] {
  const groups = new Map<string, MovementEvidence[]>();
  for (const e of evidence) groups.set(e.kind, [...(groups.get(e.kind) ?? []), e]);
  return [...groups.values()].flat().map((e, i) => {
    const kind = KIND_LABEL[e.kind] ?? e.kind;
    return {
      ...e,
      n: i + 1,
      meta: [kind, e.publisher, e.publishedAt ? sessionShortDateTime(e.publishedAt) : null].filter(Boolean).join(" · "),
      citation: citationFor(e, kind),
    };
  });
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
    { k: "Team", v: d.teamName },
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
