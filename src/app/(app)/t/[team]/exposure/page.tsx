import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { DataNoticesButton } from "@/components/app/attribution/data-quality-notice";
import { ExposureView } from "@/components/app/exposure/exposure-view";
import { SectorViewToggle, parseThroughEtfs, sectorViewQuery } from "@/components/app/exposure/lookthrough";
import { PageContextPublisher } from "@/components/app/hoot/page-context";
import { riskNotices } from "@/components/app/risk/notices";
import { loadTeamSectors } from "@/lib/attribution/load";
import { ETF_BY_SECTOR } from "@/lib/attribution/sectors";
import { canManageTeam, isFundWide, transparencyEnabled } from "@/lib/auth";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { loadRisk } from "@/lib/risk/load";
import { loadLookthrough } from "@/lib/risk/lookthrough-load";
import { parseLookback } from "@/lib/risk/model";
import { loadTeam } from "@/lib/teams";

export const metadata: Metadata = { title: "Exposure" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TeamExposurePage({ params, searchParams }: PageProps<"/t/[team]/exposure">) {
  const slug = (await params).team;
  if (slug === FUND_SCOPE_SLUG) redirect("/exposure");
  const { team, user } = await loadTeam(slug);
  // Position sizes are for leads and fund-wide roles, as on the team's Risk and Attribution pages.
  if (!canManageTeam(user, team.id)) redirect(`/t/${team.slug}`);

  const query = await searchParams;
  const lookback = parseLookback(one(query.lookback));
  const [loaded, sectorMap] = await Promise.all([loadRisk(lookback, team.id), loadTeamSectors()]);
  const sectors = sectorMap.get(team.id) ?? [];
  const base = `/t/${team.slug}/exposure`;

  if (loaded.state !== "ok" || !loaded.report.holdings.length) {
    return (
      <>
        <EmptyState title={loaded.state === "no-prices" ? "Price history is still loading" : `No positions for ${team.name}`}>
          {loaded.state === "no-prices" ? "Closing prices load after each ledger change and every weeknight." : `The ledger shows no current positions for ${team.name}.`}
        </EmptyState>
      </>
    );
  }

  const { report } = loaded;
  const lookthrough = await loadLookthrough(report);
  const throughEtfs = parseThroughEtfs(one(query.sectors)) && lookthrough.state === "ok";
  const transparency = transparencyEnabled(user);
  const notices = riskNotices(report.notices, { canEdit: isFundWide(user) }).map((n) =>
    n.text.startsWith("No S&P 500 sector weights") && sectors.length === 0 ? { ...n, text: "No GICS sectors are assigned to this team, so it has no benchmark to compare against.", href: isFundWide(user) ? "/attribution/ledger?tab=securities" : undefined, action: "Assign sectors" } : n,
  );
  return (
    <>
      <PageContextPublisher value={{ kind: "exposure", path: base, title: `${team.name} exposure`, scope: "team", team: team.slug, lookback, asOf: report.asOf }} />
      <ExposureView
        report={report}
        transparency={transparency}
        basePath={base}
        riskPath={`/t/${team.slug}/risk`}
        exportQuery={`&team=${team.slug}`}
        scopeLabel={`${team.name} sleeve`}
        benchmarkLabel={sectors.length ? sectors.map((s) => ETF_BY_SECTOR[s]).join(" + ") : "team sectors"}
        weightSetAsOf={loaded.weightSetAsOf}
        lookthrough={lookthrough}
        throughEtfs={throughEtfs}
        query={sectorViewQuery(throughEtfs)}
        controls={<SectorViewToggle basePath={base} lookback={lookback} throughEtfs={throughEtfs} available={lookthrough.state === "ok"} />}
        context={`${team.name} holdings as their own portfolio (scaled to 100%, no cash) against the team's own sectors`}
        notices={<DataNoticesButton notices={notices} />}
        teams={new Map([[team.id, { name: team.name, slug: team.slug }]])}
        factorBenchmarkLabel={sectors.length ? sectors.map((s) => ETF_BY_SECTOR[s]).join(" + ") : "the team's sectors"}
      />
    </>
  );
}
