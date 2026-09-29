import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { ExposureView, fundExposureContext } from "@/components/app/exposure/exposure-view";
import { parseThroughEtfs, sectorViewQuery } from "@/components/app/exposure/lookthrough";
import { PageContextPublisher } from "@/components/app/hoot/page-context";
import { riskNotices } from "@/components/app/risk/notices";
import { listAccessibleTeams, requireRole, transparencyEnabled } from "@/lib/auth";
import { loadRisk } from "@/lib/risk/load";
import { loadLookthrough } from "@/lib/risk/lookthrough-load";
import { parseLookback } from "@/lib/risk/model";

export const metadata: Metadata = { title: "Exposure" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ExposurePage({ searchParams }: PageProps<"/exposure">) {
  const user = await requireRole("exec", "admin");
  const query = await searchParams;
  const lookback = parseLookback(one(query.lookback));
  // The same loader as Risk (cached per request), so every weight matches it exactly.
  const [loaded, teamList] = await Promise.all([loadRisk(lookback, null), listAccessibleTeams(user)]);

  if (loaded.state !== "ok") {
    return (
      <>
        <EmptyState
          title={loaded.state === "no-ledger" ? "No trades recorded" : "Price history is still loading"}
          action={loaded.state === "no-ledger" ? <Button nativeButton={false} size="sm" render={<Link href="/attribution/ledger" />}>Open ledger</Button> : undefined}
        >
          {loaded.state === "no-ledger" ? "Exposure is measured on the Fund's positions from the trade ledger." : "Closes for the ledger's tickers load after each ledger change and every weeknight."}
        </EmptyState>
      </>
    );
  }

  const { report } = loaded;
  const lookthrough = await loadLookthrough(report);
  const throughEtfs = parseThroughEtfs(one(query.sectors)) && lookthrough.state === "ok";
  const transparency = transparencyEnabled(user);
  return (
    <>
      <PageContextPublisher value={{ kind: "exposure", path: "/exposure", title: "Fund exposure", scope: "fund", lookback, asOf: report.asOf }} />
      <ExposureView
        report={report}
        transparency={transparency}
        basePath="/exposure"
        riskPath="/risk"
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
