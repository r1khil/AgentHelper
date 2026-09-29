import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { PageContextPublisher } from "@/components/app/hoot/page-context";
import { riskNotices } from "@/components/app/risk/notices";
import { RiskView } from "@/components/app/risk/risk-view";
import { StressSection, StressSectionFallback } from "@/components/app/risk/stress-section";
import { loadTeamSectors } from "@/lib/attribution/load";
import { ETF_BY_SECTOR } from "@/lib/attribution/sectors";
import { canManageTeam, isFundWide, listAccessibleTeams, transparencyEnabled } from "@/lib/auth";
import { loadRisk } from "@/lib/risk/load";
import { LOOKBACKS, parseLookback } from "@/lib/risk/model";
import { loadScope } from "@/lib/teams";

export const metadata: Metadata = { title: "Risk" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Portfolio, Risk: the fund's (execs and admins) or a team's sleeve (its leads too), over `?lookback=`. */
export default async function RiskPage({ params, searchParams }: PageProps<"/t/[team]/risk">) {
  const slug = (await params).team;
  const scope = await loadScope(slug);
  const { user } = scope;
  const team = scope.kind === "team" ? scope.team : null;
  // Position sizes are for leads and fund-wide roles.
  if (team && !canManageTeam(user, team.id)) redirect(`/t/${team.slug}`);

  const query = await searchParams;
  const lookback = parseLookback(one(query.lookback));
  const base = `/t/${slug}/risk`;
  const canEdit = isFundWide(user);
  const transparency = transparencyEnabled(user);

  if (!team) {
    const [loaded, teamList] = await Promise.all([loadRisk(lookback, null), listAccessibleTeams(user)]);
    if (loaded.state !== "ok") {
      return (
        <EmptyState
          title={loaded.state === "no-ledger" ? "No trades recorded" : "Price history is still loading"}
          action={loaded.state === "no-ledger" ? <Button nativeButton={false} size="sm" render={<Link href="/t/fund/activity" />}>Open ledger</Button> : undefined}
        >
          {loaded.state === "no-ledger" ? "Risk is measured on the Fund's positions from the trade ledger." : "Closes for the ledger's tickers load after each ledger change and every weeknight."}
        </EmptyState>
      );
    }
    const { report } = loaded;
    return (
      <>
        <PageContextPublisher value={{ kind: "risk", path: base, title: "Fund risk", scope: "fund", lookback, asOf: report.asOf }} />
        <RiskView
          report={report}
          inception={loaded.inception}
          weightSetAsOf={loaded.weightSetAsOf}
          transparency={transparency}
          basePath={base}
          exportQuery=""
          teams={new Map(teamList.map((t) => [t.id, { name: t.name, slug: t.slug }]))}
          scopeLabel="NAV"
          benchmarkLabel="S&P 500 sectors"
          showAll={one(query.all) === "1"}
          context={`Today's positions, ${LOOKBACKS[lookback].label} of daily returns, against the S&P 500 and the sector benchmark`}
          notices={riskNotices(report.notices, { canEdit: true })}
          stress={
            <Suspense fallback={<StressSectionFallback />}>
              <StressSection report={report} fundLabel="Fund" scopeLabel="NAV" benchmarkLabel="S&P 500 sectors" transparency={transparency} exportQuery="" whatIf={`/t/${slug}/what-if`} />
            </Suspense>
          }
        />
      </>
    );
  }

  const [loaded, sectorMap] = await Promise.all([loadRisk(lookback, team.id), loadTeamSectors()]);
  const sectors = sectorMap.get(team.id) ?? [];
  if (loaded.state !== "ok" || !loaded.report.holdings.length) {
    return (
      <EmptyState title={loaded.state === "no-prices" ? "Price history is still loading" : `No positions for ${team.name}`}>
        {loaded.state === "no-prices" ? "Closing prices load after each ledger change and every weeknight." : `The ledger shows no current positions for ${team.name}.`}
      </EmptyState>
    );
  }
  const { report } = loaded;
  const benchmarkLabel = sectors.length ? sectors.map((s) => ETF_BY_SECTOR[s]).join(" + ") : "team sectors";
  const notices = riskNotices(report.notices, { canEdit }).map((n) =>
    n.text.startsWith("No S&P 500 sector weights") && sectors.length === 0 ? { ...n, text: "No GICS sectors are assigned to this team, so it has no benchmark for tracking error.", href: canEdit ? "/t/fund/activity?tab=securities" : undefined, action: "Assign sectors" } : n,
  );
  return (
    <>
      <PageContextPublisher value={{ kind: "risk", path: base, title: `${team.name} risk`, scope: "team", team: team.slug, lookback, asOf: report.asOf }} />
      <RiskView
        report={report}
        inception={loaded.inception}
        weightSetAsOf={loaded.weightSetAsOf}
        transparency={transparency}
        basePath={base}
        exportQuery={`&team=${team.slug}`}
        teams={new Map([[team.id, { name: team.name, slug: team.slug }]])}
        scopeLabel={`${team.name} sleeve`}
        benchmarkLabel={benchmarkLabel}
        showAll={one(query.all) === "1"}
        context={`${team.name} holdings as their own portfolio (scaled to 100%, no cash), ${LOOKBACKS[lookback].label} of daily returns`}
        notices={notices}
        stress={
          <Suspense fallback={<StressSectionFallback />}>
            <StressSection report={report} fundLabel={team.name} scopeLabel={`${team.name} holdings`} benchmarkLabel={benchmarkLabel} transparency={transparency} exportQuery={`&team=${team.slug}`} whatIf={`/t/${slug}/what-if`} />
          </Suspense>
        }
      />
    </>
  );
}
