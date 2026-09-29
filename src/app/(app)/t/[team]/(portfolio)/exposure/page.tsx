import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { ExposureView, fundExposureContext } from "@/components/app/exposure/exposure-view";
import { parseThroughEtfs, sectorViewQuery } from "@/components/app/exposure/lookthrough";
import { PageContextPublisher } from "@/components/app/hoot/page-context";
import { riskNotices } from "@/components/app/risk/notices";
import { loadTeamSectors } from "@/lib/attribution/load";
import { ETF_BY_SECTOR } from "@/lib/attribution/sectors";
import { canManageTeam, isFundWide, listAccessibleTeams, transparencyEnabled } from "@/lib/auth";
import { loadRisk } from "@/lib/risk/load";
import { loadLookthrough } from "@/lib/risk/lookthrough-load";
import { parseLookback } from "@/lib/risk/model";
import { loadScope } from "@/lib/teams";

export const metadata: Metadata = { title: "Exposure" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Portfolio, Exposure: the fund's tilts (execs and admins) or a team's sleeve against its own sectors (its leads too). */
export default async function ExposurePage({ params, searchParams }: PageProps<"/t/[team]/exposure">) {
  const slug = (await params).team;
  const scope = await loadScope(slug);
  const { user } = scope;
  const team = scope.kind === "team" ? scope.team : null;
  // Position sizes are for leads and fund-wide roles, as on Risk and Performance.
  if (team && !canManageTeam(user, team.id)) redirect(`/t/${team.slug}`);

  const query = await searchParams;
  // The same loader as Risk (cached per request), so every weight matches it exactly.
  const lookback = parseLookback(one(query.lookback));
  const base = `/t/${slug}/exposure`;
  const riskPath = `/t/${slug}/risk`;
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
          {loaded.state === "no-ledger" ? "Exposure is measured on the Fund's positions from the trade ledger." : "Closes for the ledger's tickers load after each ledger change and every weeknight."}
        </EmptyState>
      );
    }
    const { report } = loaded;
    const lookthrough = await loadLookthrough(report);
    const throughEtfs = parseThroughEtfs(one(query.sectors)) && lookthrough.state === "ok";
    return (
      <>
        <PageContextPublisher value={{ kind: "exposure", path: base, title: "Fund exposure", scope: "fund", lookback, asOf: report.asOf }} />
        <ExposureView
          report={report}
          transparency={transparency}
          basePath={base}
          riskPath={riskPath}
          exportQuery=""
          scopeLabel="Fund"
          benchmarkLabel="S&P 500 sectors"
          weightSetAsOf={loaded.weightSetAsOf}
          lookthrough={lookthrough}
          throughEtfs={throughEtfs}
          query={sectorViewQuery(throughEtfs)}
          context={fundExposureContext(loaded.weightSetAsOf, throughEtfs)}
          notices={riskNotices(report.notices, { canEdit: true })}
          teams={new Map(teamList.map((t) => [t.id, { name: t.name, slug: t.slug }]))}
          factorBenchmarkLabel="the S&P 500 sector benchmark"
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
  const lookthrough = await loadLookthrough(report);
  const throughEtfs = parseThroughEtfs(one(query.sectors)) && lookthrough.state === "ok";
  const etfs = sectors.length ? sectors.map((s) => ETF_BY_SECTOR[s]).join(" + ") : null;
  const notices = riskNotices(report.notices, { canEdit }).map((n) =>
    n.text.startsWith("No S&P 500 sector weights") && sectors.length === 0 ? { ...n, text: "No GICS sectors are assigned to this team, so it has no benchmark to compare against.", href: canEdit ? "/t/fund/activity?tab=securities" : undefined, action: "Assign sectors" } : n,
  );
  return (
    <>
      <PageContextPublisher value={{ kind: "exposure", path: base, title: `${team.name} exposure`, scope: "team", team: team.slug, lookback, asOf: report.asOf }} />
      <ExposureView
        report={report}
        transparency={transparency}
        basePath={base}
        riskPath={riskPath}
        exportQuery={`&team=${team.slug}`}
        scopeLabel={`${team.name} sleeve`}
        benchmarkLabel={etfs ?? "team sectors"}
        weightSetAsOf={loaded.weightSetAsOf}
        lookthrough={lookthrough}
        throughEtfs={throughEtfs}
        query={sectorViewQuery(throughEtfs)}
        context={`${team.name} holdings as their own portfolio (scaled to 100%, no cash) against the team's own sectors`}
        notices={notices}
        teams={new Map([[team.id, { name: team.name, slug: team.slug }]])}
        factorBenchmarkLabel={etfs ?? "the team's sectors"}
      />
    </>
  );
}
