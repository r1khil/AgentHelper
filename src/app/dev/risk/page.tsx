import { notFound } from "next/navigation";
import { RiskView } from "@/components/app/risk/risk-view";
import { parseLookback } from "@/lib/risk/model";
import { previewEnabled, previewReport } from "@/lib/risk/preview";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Preview({ searchParams }: PageProps<"/dev/risk">) {
  if (!previewEnabled()) notFound();
  const query = await searchParams;
  const team = one(query.scope) === "team";
  const report = previewReport(parseLookback(one(query.lookback)), { team });
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <p className="mb-4 rounded border border-dashed p-3 text-sm">Local browser QA · synthetic prices and holdings · no live portfolio data · add ?scope=team for the team view, ?transparency=0 to hide the working</p>
      <RiskView
        report={report}
        inception={report.realized?.from ?? report.asOf}
        weightSetAsOf="2026-09-01"
        transparency={one(query.transparency) !== "0"}
        basePath="/dev/risk"
        exportQuery=""
        teams={new Map()}
        scopeLabel={team ? "Tech & media sleeve" : "NAV"}
        benchmarkLabel={team ? "XLK + XLC" : "S&P 500 sectors"}
        showAll={one(query.all) === "1"}
      />
    </main>
  );
}
