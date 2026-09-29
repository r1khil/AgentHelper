import Link from "next/link";
import { FUND_SCOPE_SLUG, MOVEMENT_THRESHOLD_PP } from "@/lib/constants";
import { fmtBp, fmtChangeBp, fmtChangePct, fmtDateTime, fmtDayMonth, ppToBp, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHead, ScopeMenu } from "@/components/app/page-head";
import { Pill } from "@/components/app/panel";
import { FeedbackPanel } from "@/components/app/feedback-panel";
import { HootMoodFor } from "@/components/app/hoot/presence";
import { RowLink } from "@/components/app/row-link";
import { MovementWorkspace, type EvidenceGroup, type EvidenceRow } from "./workspace";
import { citationFor } from "./cite";
import { GROUP_LABEL, GROUP_ORDER, KIND_LABEL, dirClass, dueLabel, gatheredAt, movementPill, overdueLabel, sessionLong, sessionShort, sessionShortDateTime, wordCount } from "./format";
import type { MovementDetailData, MovementEvidence, MovementListItem } from "./types";

/** The scope the page is in: its URL slug and what to call it in the header ("Whole fund" or the team's name). */
export type MovementsScope = { slug: string; label: string };

/**
 * Movements as three columns filling the window: the list on the left, the selected movement's write-up in the
 * middle, and the evidence Hoot gathered on the right. Rendered by both /movements (most relevant item selected)
 * and /movements/[id].
 */
export function MovementsView({ scope, items, selected }: { scope: MovementsScope; items: MovementListItem[]; selected: MovementDetailData | null }) {
  const anyOverdue = items.some((i) => i.overdue) || !!selected?.overdue;
  const open = items.filter((i) => i.status !== "completed").length;
  const asof = [scope.label, `${open} open · ${items.length - open} completed`, selected && `anyone on ${selected.teamName} can write this one`].filter(Boolean).join(" · ");
  return (
    <div data-full-bleed className="flex h-dvh min-h-0 flex-col">
      <PageHead
        crumbs={[{ label: "Movements", href: selected ? `/t/${scope.slug}/movements` : undefined }, ...(selected ? [{ label: `${selected.ticker} · ${fmtDayMonth(selected.sessionDate)}` }] : [])]}
        asof={asof}
        tabs={false}
      />
      {anyOverdue && <HootMoodFor mood="concerned" />}
      <div className="flex min-h-0 flex-1">
        <MovementList items={items} selectedId={selected?.id ?? null} showTeam={scope.slug === FUND_SCOPE_SLUG} />
        {selected ? (
          <MovementDetail d={selected} />
        ) : (
          <div className="flex min-w-0 flex-1 items-start px-8 pt-[26px] text-body text-muted-foreground">Select a movement to see its evidence and write-up.</div>
        )}
      </div>
    </div>
  );
}

function MovementList({ items, selectedId, showTeam }: { items: MovementListItem[]; selectedId: string | null; showTeam: boolean }) {
  return (
    <aside aria-label="Movements" data-tour="movements-list" className="flex w-[260px] shrink-0 flex-col overflow-y-auto border-r pt-3.5 pr-4 pb-10 pl-10">
      <div className="mb-1.5 self-start">
        <ScopeMenu label="All teams" />
      </div>
      <ul>
        {items.map((i) => {
          const status = i.dataQuality && i.status !== "completed" ? { tone: "caution" as const, label: "Data problem" } : movementPill(i.status, i.overdue);
          const bp = ppToBp(i.relativePp);
          const on = i.id === selectedId;
          return (
            <li key={i.id}>
              <RowLink
                href={i.href}
                aria-current={on ? "page" : undefined}
                title={[i.dataQuality, i.completedByName && `Completed by ${i.completedByName}`].filter(Boolean).join(" · ") || undefined}
                className={cn(
                  "-mx-2 flex flex-col gap-0.5 rounded-lg border-b border-row px-2 py-2.5 text-body transition-colors outline-none hover:bg-band focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  on && "bg-secondary hover:bg-secondary",
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <b className={cn(on ? "font-bold" : "font-semibold")}>{i.ticker}</b>
                  <span className={i.dataQuality ? "text-muted-foreground" : dirClass(bp)}>{i.dataQuality ? "—" : fmtChangeBp(bp)}</span>
                </span>
                <span className="flex items-baseline justify-between gap-2">
                  <Pill tone={status.tone}>{status.label}</Pill>
                  <span className="min-w-0 truncate text-caption text-muted-foreground" title={i.teamName ?? undefined}>
                    {[showTeam && i.teamName, sessionShort(i.sessionDate)].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </RowLink>
            </li>
          );
        })}
      </ul>
      <p className="mt-3.5 text-caption text-muted-foreground">
        Opened when a holding&apos;s daily return differs from the S&amp;P 500&apos;s by {fmtBp(MOVEMENT_THRESHOLD_PP * 100)} or more, on official closes. Due noon the next trading day. Checked nightly after the close.
      </p>
    </aside>
  );
}

function MovementDetail({ d }: { d: MovementDetailData }) {
  const status = d.status === "completed" ? `Completed ${relativeTime(d.completedAt)}${d.completedByName ? ` by ${d.completedByName}` : ""}` : d.updateText?.trim() ? `Draft · ${wordCount(d.updateText)} words` : "Not started";
  const latest = d.evidence.reduce<Date | null>((a, e) => (!a || e.retrievedAt > a ? e.retrievedAt : a), null);
  const groups = evidenceGroups(d.evidence);
  const noFilings = d.evidenceStatus === "ready" && d.evidence.length > 0 && !d.evidence.some((e) => e.kind === "filing");
  const filings = noFilings ? (d.hasCik ? "nothing in the window. That is a finding too." : "not searched, this holding has no SEC number on file.") : null;
  return (
    <MovementWorkspace
      d={d}
      head={<MovementHead d={d} />}
      status={status}
      groups={groups}
      gathered={latest && gatheredAt(latest)}
      filings={filings}
      feedback={d.feedback && <FeedbackPanel feedback={d.feedback} currentText={d.updateText} className="mt-[26px]" />}
    />
  );
}

/** The big number and the line under it, then the facts row: team, leads, due, status. */
function MovementHead({ d }: { d: MovementDetailData }) {
  const bp = ppToBp(d.relativePp);
  return (
    <>
      {d.dataQuality ? (
        <div className="flex items-baseline gap-3.5">
          <span className="hero-figure text-muted-foreground">—</span>
          <span className="text-emph text-caution-foreground">
            Data problem: {d.dataQuality}. No calculation was made; resolve the data issue and re-run the close check.
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-3.5">
          <span className={cn("hero-figure", dirClass(bp))} title={`Relative to the S&P 500. Official closes · Yahoo Finance. Rule: relative move of ${fmtBp(MOVEMENT_THRESHOLD_PP * 100)} or more.`}>
            {fmtChangeBp(bp)}
          </span>
          <span className="text-emph text-muted-foreground">
            <Link href={d.holdingHref} title={d.companyName} className="text-foreground underline-offset-2 hover:underline">
              {d.ticker}
            </Link>{" "}
            <span className={cn("font-semibold", dirClass(d.holdingReturnPct, 100))}>{fmtChangePct(d.holdingReturnPct)}</span> · S&amp;P 500 {fmtChangePct(d.spxReturnPct)} · {sessionLong(d.sessionDate)}
          </span>
        </div>
      )}
      <FactsRow d={d} />
    </>
  );
}

function FactsRow({ d }: { d: MovementDetailData }) {
  const status = d.dataQuality && d.status !== "completed" ? (
    <b className="font-semibold text-caution-foreground">Data problem</b>
  ) : d.overdue ? (
    <b className="font-semibold text-down">{overdueLabel(d.dueAt)}</b>
  ) : (
    <b className="font-semibold">{d.status === "completed" ? "Completed" : d.status === "in_progress" ? "In progress" : "Open"}</b>
  );
  const leads = d.leadNames.length ? d.leadNames.join(", ") : "—";
  const emailed = d.alertSentAt ? `emailed ${fmtDateTime(d.alertSentAt)}` : d.alertRecipients > 0 ? "email not sent yet" : null;
  const facts: { k: string; v: React.ReactNode }[] = [
    { k: "Team", v: <b className="font-semibold">{d.teamName}</b> },
    {
      k: d.leadNames.length > 1 ? "Leads" : "Lead",
      v: (
        <b className="font-semibold">
          {leads}
          {emailed && <span className={cn("font-normal", d.alertSentAt ? "text-muted-foreground" : "text-caution-foreground")}>, {emailed}</span>}
        </b>
      ),
    },
    { k: "Due", v: <b className="font-semibold">{dueLabel(d.dueAt)}</b> },
    { k: "Status", v: status },
  ];
  return (
    <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-1 border-b pb-3.5 text-body">
      {facts.map((f) => (
        <div key={f.k}>
          <dt className="inline text-muted-foreground">{f.k}</dt> <dd className="inline">{f.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The evidence grouped by kind in the order the groups run (prices, news, filings, peers…), numbered straight through. */
function evidenceGroups(evidence: MovementEvidence[]): EvidenceGroup[] {
  const kinds = [...GROUP_ORDER, ...new Set(evidence.map((e) => e.kind))].filter((k, i, all) => all.indexOf(k) === i && evidence.some((e) => e.kind === k));
  let n = 0;
  return kinds.map((kind) => ({
    kind,
    label: GROUP_LABEL[kind] ?? KIND_LABEL[kind] ?? kind,
    items: evidence
      .filter((e) => e.kind === kind)
      .map<EvidenceRow>((e) => ({
        ...e,
        n: ++n,
        meta: [e.publisher, e.publishedAt ? sessionShortDateTime(e.publishedAt) : null].filter(Boolean).join(" · "),
        citation: citationFor(e, KIND_LABEL[kind] ?? kind),
      })),
  }));
}
