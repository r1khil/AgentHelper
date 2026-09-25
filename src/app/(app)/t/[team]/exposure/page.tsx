import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { DataNoticesButton } from "@/components/app/attribution/data-quality-notice";
import { ExposureView } from "@/components/app/exposure/exposure-view";
import { FactorSection } from "@/components/app/exposure/factor-section";
import { PageContextPublisher } from "@/components/app/hoot/page-context";
import { riskNotices } from "@/components/app/risk/notices";
import { loadTeamSectors } from "@/lib/attribution/load";
import { ETF_BY_SECTOR } from "@/lib/attribution/sectors";
import { canManageTeam, isFundWide, transparencyEnabled } from "@/lib/auth";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { loadRisk } from "@/lib/risk/load";
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
        <PageHeader title="Exposure" description={team.name} />
        <EmptyState title={loaded.state === "no-prices" ? "Price history is still loading" : "No positions"}>
          {loaded.state === "no-prices" ? "Closing prices load after each ledger change and every weeknight." : `The ledger shows no current positions for ${team.name}.`}
        </EmptyState>
      </>
    );
  }

  const { report } = loaded;
  const notices = riskNotices(report.notices, { canEdit: isFundWide(user) }).map((n) =>
    n.text.startsWith("No S&P 500 sector weights") && sectors.length === 0 ? { ...n, text: "No GICS sectors are assigned to this team, so it has no benchmark to compare against.", href: isFundWide(user) ? "/attribution/ledger?tab=securities" : undefined, action: "Assign sectors" } : n,
  );
  return (
    <>
      <PageHeader
        title="Exposure"
        description={`${team.name} holdings as their own portfolio (scaled to 100%, no cash) against the team's own sectors`}
        actions={<DataNoticesButton notices={notices} />}
      />
      <PageContextPublisher value={{ kind: "exposure", path: base, title: `${team.name} exposure`, scope: "team", team: team.slug, lookback, asOf: report.asOf }} />
      <ExposureView
        report={report}
        transparency={transparencyEnabled(user)}
        basePath={base}
        riskPath={`/t/${team.slug}/risk`}
        exportQuery={`&team=${team.slug}`}
        scopeLabel={`${team.name} sleeve`}
        benchmarkLabel={sectors.length ? sectors.map((s) => ETF_BY_SECTOR[s]).join(" + ") : "team sectors"}
        weightSetAsOf={loaded.weightSetAsOf}
      >
        <FactorSection report={report} transparency={transparencyEnabled(user)} exportQuery={`&team=${team.slug}`} benchmarkLabel={sectors.length ? sectors.map((s) => ETF_BY_SECTOR[s]).join(" + ") : "the team's sectors"} />
      </ExposureView>
    </>
  );
}
