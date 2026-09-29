import { Suspense } from "react";
import { AddHoldingDialog } from "@/components/app/add-holding-dialog";
import { EmptyState } from "@/components/app/empty-state";
import { PageHead } from "@/components/app/page-head";
import { StatStrip, type StatCell } from "@/components/app/panel";
import { attentionFlags, reportsWithin } from "@/components/app/holdings/attention";
import { HoldingsTable, type HoldingListRow, type QuoteCells } from "@/components/app/holdings/holdings-table";
import { HoldingsToolbar, type HoldingFilter } from "@/components/app/holdings/holdings-toolbar";
import { LiveMarketLine, TeamAsOf, TeamHero, TeamHeroFallback } from "@/components/app/holdings/team-sections";
import { Skeleton } from "@/components/ui/skeleton";
import { computeTeamAttribution } from "@/lib/attribution/attribution";
import { loadAttributionSeries, loadTeamSectors } from "@/lib/attribution/load";
import { resolvePeriod } from "@/lib/attribution/periods";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { canManageTeam } from "@/lib/auth";
import { fmtDateTime, fmtDayMonth, fmtPct } from "@/lib/format";
import { listHoldingSignals, listRecentCloses, listTeamHoldings, listTeamMembers } from "@/lib/holdings";
import { marketSnapshot } from "@/lib/market";
import { todayNY } from "@/lib/providers/calendar";
import { holdingHref, scopeFor } from "@/lib/scope";
import type { TeamScope } from "@/lib/teams";

type TeamOnly = Extract<TeamScope, { kind: "team" }>;

/**
 * A team's page: what it is worth and did today (its leads, execs and admins; everyone else sees its move), who is on
 * it and what it owes, then its holdings with what needs attention. The holdings come from the database at once and
 * the quotes stream in when Yahoo answers.
 */
export async function TeamPage({ scope, filter }: { scope: TeamOnly; filter: HoldingFilter }) {
  const { team, user, teamById } = scope;
  const slug = scope.slug;
  const book = canManageTeam(user, team.id);
  const today = todayNY();
  const rows = await listTeamHoldings(scope.teamIds);
  const [signals, closes, members] = await Promise.all([
    listHoldingSignals(rows.map((r) => r.h.id), today),
    listRecentCloses(rows.map((r) => r.h.ticker), 6).catch(() => new Map<string, number[]>()),
    listTeamMembers(team.id),
  ]);
  // Not awaited: the holdings render from the database at once and the quotes stream in when Yahoo answers.
  const market = marketSnapshot(rows.map((r) => r.h.ticker));
  const now = nowMs();

  const listRows: (HoldingListRow & { reporting: boolean })[] = rows.map(({ h }) => {
    const s = signals.get(h.id);
    const next = s?.nextReport ?? null;
    return {
      id: h.id,
      ticker: h.ticker,
      company: h.companyName,
      href: holdingHref(slug, teamById.get(h.teamId)?.slug ?? slug, h.ticker),
      weightPct: h.weightPct == null ? null : Number(h.weightPct),
      shares: h.shares == null ? null : Number(h.shares),
      spark: closes.get(h.ticker) ?? [],
      nextReport: next ? `${fmtDayMonth(next.reportDate)}${next.estimated ? " (est.)" : ""}` : null,
      flags: attentionFlags(
        { openMovement: s?.openMovement ?? null, nextReport: next, modelUpdates: s?.modelUpdates ?? 0, thesisProposed: s?.thesisProposed ?? false },
        { teamSlug: scopeFor(slug, team.slug), ticker: h.ticker, today, now },
      ),
      reporting: reportsWithin(next?.reportDate, today),
    };
  });

  const counts: Record<HoldingFilter, number> = {
    all: listRows.length,
    attention: listRows.filter((r) => r.flags.length > 0).length,
    reporting: listRows.filter((r) => r.reporting).length,
  };
  const shown = listRows.filter((r) => (filter === "attention" ? r.flags.length > 0 : filter === "reporting" ? r.reporting : true));
  const emptyText = filter === "attention" ? "Nothing needs attention right now." : filter === "reporting" ? "No holding reports in the next two weeks." : "No holdings.";

  // Who is on the team and what it owes.
  const leads = members.filter((m) => m.role === "lead_analyst");
  const associates = members.filter((m) => m.role === "associate_analyst");
  const open = [...signals.values()].flatMap((s) => (s.openMovement ? [s.openMovement] : []));
  const overdue = open.filter((m) => m.dueAt && m.dueAt.getTime() < now);
  const soonest = [...open].filter((m) => m.dueAt).sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())[0];
  const soonestTicker = soonest ? rows.find((r) => signals.get(r.h.id)?.openMovement?.id === soonest.id)?.h.ticker : undefined;
  const reports = [...signals.entries()].flatMap(([id, s]) => (s.nextReport ? [{ ticker: rows.find((r) => r.h.id === id)?.h.ticker ?? "", ...s.nextReport }] : [])).sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  const nextReport = reports[0];

  const cells: StatCell[] = [
    { label: "Leads", value: leads.length, note: leads.length ? "Get the movement and prep emails" : "No lead yet, so everyone on the team gets them" },
    { label: "Members", value: members.length, note: associates.length ? `${associates.length} associate ${associates.length === 1 ? "analyst" : "analysts"}` : leads.length ? "Leads only" : undefined },
    {
      label: "Open write-ups",
      value: overdue.length ? `${overdue.length} overdue` : open.length ? `${open.length} open` : "None open",
      tone: overdue.length ? "down" : null,
      note: soonest && soonestTicker ? `${soonestTicker}, due ${fmtDateTime(soonest.dueAt!)}` : "Nothing owed",
    },
    { label: "Next report", value: nextReport ? fmtDayMonth(nextReport.reportDate) : "None scheduled", note: nextReport ? `${nextReport.ticker}, ${nextReport.estimated ? "estimated" : "confirmed"}` : "Dates refresh every morning" },
  ];

  // Against its sectors since the ledger opened: the team's book, for those who see it.
  const sinceBp = book ? await sinceOpening(team.id) : null;
  const navShare = book ? listRows.reduce((s, r) => s + (r.weightPct ?? 0), 0) : null;
  const label = `${team.name} · ${listRows.length} ${listRows.length === 1 ? "holding" : "holdings"}${navShare ? ` · ${fmtPct(navShare)} of the fund` : ""}`;

  return (
    <>
      <PageHead
        crumbs={[{ label: "Teams" }, { label: team.name }]}
        asof={
          <Suspense fallback={null}>
            <TeamAsOf market={market} />
          </Suspense>
        }
        actions={<AddHoldingDialog teamId={team.id} primary />}
        tabs={false}
      />
      <div className="flex flex-col">
        <Suspense fallback={<TeamHeroFallback label={label} book={book} />}>
          <TeamHero input={{ label, teamName: team.name, rows: listRows, book, sinceBp }} market={market} />
        </Suspense>
        <StatStrip className="mt-[18px]" cells={cells} />
        <HoldingsToolbar basePath={`/t/${slug}`} active={filter} counts={counts} aside={<Suspense fallback={<Skeleton className="h-4 w-48" />}><LiveMarketLine market={market} today={today} /></Suspense>} />
        {rows.length === 0 ? (
          <EmptyState title="No holdings yet" hoot="wave" className="mt-4">
            Add the tickers this team covers. Each one gets live prices, filings, news, and movement alerts.
          </EmptyState>
        ) : (
          <Suspense fallback={<HoldingsTable rows={shown} empty={emptyText} showWeight={book} />}>
            <LiveHoldingsTable rows={shown} empty={emptyText} showWeight={book} market={market} />
          </Suspense>
        )}
      </div>
    </>
  );
}

/** How the team's holdings did against the sectors assigned to it, from the ledger's opening. */
async function sinceOpening(teamId: string) {
  try {
    const [loaded, sectorMap] = await Promise.all([loadAttributionSeries(), loadTeamSectors()]);
    const sectors = sectorMap.get(teamId) ?? [];
    if (!loaded.inception || !loaded.latest || loaded.series.portfolio.length < 2 || !sectors.length) return null;
    const period = resolvePeriod("itd", { inception: loaded.inception, latest: loaded.latest });
    const r = computeTeamAttribution(loaded.series, period, teamId, sectors);
    if (r.activeReturn === null) return null;
    return { bp: r.activeReturn * 10_000, label: sectors.length === 1 ? SECTOR_LABELS[sectors[0]] : "its sectors", from: period.start };
  } catch (e) {
    console.error("[team] since-opening failed", e);
    return null;
  }
}

async function LiveHoldingsTable({ market, ...props }: { rows: HoldingListRow[]; empty: string; showWeight: boolean; market: ReturnType<typeof marketSnapshot> }) {
  const snap = await market;
  const quotes: QuoteCells = {};
  for (const [ticker, m] of Object.entries(snap.rows)) quotes[ticker] = { price: m.quote?.price, changePct: m.quote?.changePct, relativePp: m.relativePp };
  return <HoldingsTable {...props} quotes={quotes} />;
}

/** Read once per request; a helper so the render stays free of impure calls. */
function nowMs() {
  return Date.now();
}
