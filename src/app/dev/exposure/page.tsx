import { notFound } from "next/navigation";
import { ExposureView, fundExposureContext } from "@/components/app/exposure/exposure-view";
import { SectorViewToggle, parseThroughEtfs, sectorViewQuery } from "@/components/app/exposure/lookthrough";
import type { LookthroughState } from "@/lib/risk/lookthrough-report";
import { parseLookback } from "@/lib/risk/model";
import { PREVIEW_ETFS, previewEnabled, previewLookthrough, previewReport } from "@/lib/risk/preview";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Preview({ searchParams }: PageProps<"/dev/exposure">) {
  if (!previewEnabled()) notFound();
  const query = await searchParams;
  const team = one(query.scope) === "team";
  const lookback = parseLookback(one(query.lookback));
  const report = previewReport(lookback, { team });
  // ?lookthrough=none previews the page before any ETF holdings are stored.
  const lookthrough: LookthroughState = one(query.lookthrough) === "none" ? { state: "unavailable", reason: "no-lists", heldEtfs: Object.keys(PREVIEW_ETFS) } : previewLookthrough(report);
  const throughEtfs = parseThroughEtfs(one(query.sectors)) && lookthrough.state === "ok";
  const transparency = one(query.transparency) !== "0";
  return (
    <main className="flex min-h-dvh flex-col p-6">
      <p className="mb-4 rounded-[10px] border border-dashed p-3 text-body">
        Local browser QA · synthetic prices and holdings · no live portfolio data · add ?scope=team for the team view, ?transparency=0 to hide the working, ?lookthrough=none for no ETF lists. CHRL, GOLF, ECHO and NOVR stand in as ETFs (full list, top 10 only, partial and stale, no list).
      </p>
      <ExposureView
        report={report}
        transparency={transparency}
        basePath="/dev/exposure"
        riskPath="/dev/risk"
        exportQuery=""
        scopeLabel={team ? "Tech & media sleeve" : "Fund"}
        benchmarkLabel={team ? "XLK + XLC" : "S&P 500 sectors"}
        weightSetAsOf="2026-09-01"
        lookthrough={lookthrough}
        throughEtfs={throughEtfs}
        query={`${sectorViewQuery(throughEtfs)}${team ? "&scope=team" : ""}`}
        controls={<SectorViewToggle basePath="/dev/exposure" lookback={lookback} throughEtfs={throughEtfs} available={lookthrough.state === "ok"} extra={team ? "&scope=team" : ""} />}
        context={team ? "Tech & media holdings as their own portfolio (scaled to 100%, no cash) against the team's own sectors" : fundExposureContext("2026-09-01", throughEtfs)}
        teams={new Map()}
        factorBenchmarkLabel={team ? "XLK + XLC" : "the S&P 500 sector benchmark"}
      />
    </main>
  );
}
