import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { PageContextPublisher } from "@/components/app/hoot/page-context";
import { riskNotices } from "@/components/app/risk/notices";
import { RiskView } from "@/components/app/risk/risk-view";
import { StressSection, StressSectionFallback } from "@/components/app/risk/stress-section";
import { loadTeamSectors } from "@/lib/attribution/load";
import { ETF_BY_SECTOR } from "@/lib/attribution/sectors";
import { canManageTeam, isFundWide, transparencyEnabled } from "@/lib/auth";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { loadRisk } from "@/lib/risk/load";
import { LOOKBACKS, parseLookback } from "@/lib/risk/model";
import { loadTeam } from "@/lib/teams";

export const metadata: Metadata = { title: "Risk" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TeamRiskPage({ params, searchParams }: PageProps<"/t/[team]/risk">) {
  const slug = (await params).team;
  if (slug === FUND_SCOPE_SLUG) redirect("/risk");
  const { team, user } = await loadTeam(slug);
  // Position sizes are for leads and fund-wide roles, as on the team's attribution page.
  if (!canManageTeam(user, team.id)) redirect(`/t/${team.slug}`);

  const query = await searchParams;
  const lookback = parseLookback(one(query.lookback));
  const [loaded, sectorMap] = await Promise.all([loadRisk(lookback, team.id), loadTeamSectors()]);
  const sectors = sectorMap.get(team.id) ?? [];
  const base = `/t/${team.slug}/risk`;

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
  const notices = riskNotices(report.notices, { canEdit: isFundWide(user) }).map((n) =>
    n.text.startsWith("No S&P 500 sector weights") && sectors.length === 0 ? { ...n, text: "No GICS sectors are assigned to this team, so it has no benchmark for tracking error.", href: isFundWide(user) ? "/attribution/ledger?tab=securities" : undefined, action: "Assign sectors" } : n,
  );
  return (
    <>
      <PageContextPublisher value={{ kind: "risk", path: base, title: `${team.name} risk`, scope: "team", team: team.slug, lookback, asOf: report.asOf }} />
      <RiskView
        report={report}
        inception={loaded.inception}
        weightSetAsOf={loaded.weightSetAsOf}
        transparency={transparencyEnabled(user)}
        basePath={base}
        exportQuery={`&team=${team.slug}`}
        teams={new Map([[team.id, { name: team.name, slug: team.slug }]])}
        scopeLabel={`${team.name} sleeve`}
        benchmarkLabel={sectors.length ? sectors.map((s) => ETF_BY_SECTOR[s]).join(" + ") : "team sectors"}
        showAll={one(query.all) === "1"}
        context={`${team.name} holdings as their own portfolio (scaled to 100%, no cash) · ${LOOKBACKS[lookback].label} of daily returns`}
        notices={notices}
        stress={
          <Suspense fallback={<StressSectionFallback />}>
            <StressSection
              report={report}
              fundLabel={team.name}
              scopeLabel={`${team.name} holdings`}
              benchmarkLabel={sectors.length ? sectors.map((s) => ETF_BY_SECTOR[s]).join(" + ") : "team sectors"}
              transparency={transparencyEnabled(user)}
              exportQuery={`&team=${team.slug}`}
            />
          </Suspense>
        }
      />
    </>
  );
}
