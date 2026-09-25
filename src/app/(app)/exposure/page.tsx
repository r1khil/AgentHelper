import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { DataNoticesButton } from "@/components/app/attribution/data-quality-notice";
import { ExposureView } from "@/components/app/exposure/exposure-view";
import { FactorSection } from "@/components/app/exposure/factor-section";
import { LookthroughSections, SectorViewToggle, parseThroughEtfs, sectorViewQuery } from "@/components/app/exposure/lookthrough";
import { PageContextPublisher } from "@/components/app/hoot/page-context";
import { riskNotices } from "@/components/app/risk/notices";
import { requireRole, transparencyEnabled } from "@/lib/auth";
import { loadRisk } from "@/lib/risk/load";
import { loadLookthrough } from "@/lib/risk/lookthrough-load";
import { parseLookback } from "@/lib/risk/model";

export const metadata: Metadata = { title: "Fund exposure" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ExposurePage({ searchParams }: PageProps<"/exposure">) {
  const user = await requireRole("exec", "admin");
  const query = await searchParams;
  const lookback = parseLookback(one(query.lookback));
  // The same loader as Risk (cached per request), so every weight matches it exactly.
  const loaded = await loadRisk(lookback, null);

  if (loaded.state !== "ok") {
    return (
      <>
        <PageHeader title="Fund exposure" />
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
      <PageHeader
        title="Fund exposure"
        description="Today's positions by sector against the S&P 500, the largest bets and how concentrated the book is"
        actions={<DataNoticesButton notices={riskNotices(report.notices, { canEdit: true })} />}
      />
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
        controls={<SectorViewToggle basePath="/exposure" lookback={lookback} throughEtfs={throughEtfs} available={lookthrough.state === "ok"} />}
      >
        <FactorSection report={report} transparency={transparency} exportQuery="" benchmarkLabel="the S&P 500 sector benchmark" />
        <LookthroughSections state={lookthrough} scope="fund" transparency={transparency} />
      </ExposureView>
    </>
  );
}
