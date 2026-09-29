import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { PageContextPublisher } from "@/components/app/hoot/page-context";
import { riskNotices } from "@/components/app/risk/notices";
import { RiskView } from "@/components/app/risk/risk-view";
import { StressSection, StressSectionFallback } from "@/components/app/risk/stress-section";
import { listAccessibleTeams, requireRole, transparencyEnabled } from "@/lib/auth";
import { loadRisk } from "@/lib/risk/load";
import { LOOKBACKS, parseLookback } from "@/lib/risk/model";

export const metadata: Metadata = { title: "Risk" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function RiskPage({ searchParams }: PageProps<"/risk">) {
  const user = await requireRole("exec", "admin");
  const query = await searchParams;
  const lookback = parseLookback(one(query.lookback));
  const [loaded, teamList] = await Promise.all([loadRisk(lookback, null), listAccessibleTeams(user)]);

  if (loaded.state !== "ok") {
    return (
      <>
        <EmptyState
          title={loaded.state === "no-ledger" ? "No trades recorded" : "Price history is still loading"}
          action={loaded.state === "no-ledger" ? <Button nativeButton={false} size="sm" render={<Link href="/attribution/ledger" />}>Open ledger</Button> : undefined}
        >
          {loaded.state === "no-ledger" ? "Risk is measured on the Fund's positions from the trade ledger." : "Closes for the ledger's tickers load after each ledger change and every weeknight."}
        </EmptyState>
      </>
    );
  }

  const { report } = loaded;
  const teams = new Map(teamList.map((t) => [t.id, { name: t.name, slug: t.slug }]));
  return (
    <>
      <PageContextPublisher value={{ kind: "risk", path: "/risk", title: "Fund risk", scope: "fund", lookback, asOf: report.asOf }} />
      <RiskView
        report={report}
        inception={loaded.inception}
        weightSetAsOf={loaded.weightSetAsOf}
        transparency={transparencyEnabled(user)}
        basePath="/risk"
        exportQuery=""
        teams={teams}
        scopeLabel="NAV"
        benchmarkLabel="S&P 500 sectors"
        showAll={one(query.all) === "1"}
        context={`Today's positions · ${LOOKBACKS[lookback].label} of daily returns · vs S&P 500 and sector benchmark`}
        notices={riskNotices(report.notices, { canEdit: true })}
        stress={
          <Suspense fallback={<StressSectionFallback />}>
            <StressSection report={report} fundLabel="Fund" scopeLabel="NAV" benchmarkLabel="S&P 500 sectors" transparency={transparencyEnabled(user)} exportQuery="" />
          </Suspense>
        }
      />
    </>
  );
}
