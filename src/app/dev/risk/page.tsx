import { notFound } from "next/navigation";
import { RiskView } from "@/components/app/risk/risk-view";
import { STRESS_DETAIL, StressPanel } from "@/components/app/risk/stress-panel";
import { StressTests } from "@/components/app/risk/stress-tests";
import { LOOKBACKS, parseLookback } from "@/lib/risk/model";
import { previewEnabled, previewReport, previewStress } from "@/lib/risk/preview";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Preview({ searchParams }: PageProps<"/dev/risk">) {
  if (!previewEnabled()) notFound();
  const query = await searchParams;
  const team = one(query.scope) === "team";
  const lookback = parseLookback(one(query.lookback));
  const report = previewReport(lookback, { team });
  const stress = previewStress(report);
  const transparency = one(query.transparency) !== "0";
  return (
    <main className="flex min-h-dvh flex-col p-6">
      <p className="mb-4 rounded-[10px] border border-dashed p-3 text-sm">Local browser QA · synthetic prices and holdings · no live portfolio data · add ?scope=team for the team view, ?transparency=0 to hide the working</p>
      <RiskView
        report={report}
        inception={report.realized?.from ?? report.asOf}
        weightSetAsOf="2026-09-01"
        transparency={transparency}
        basePath="/dev/risk"
        exportQuery=""
        teams={new Map()}
        scopeLabel={team ? "Tech & media sleeve" : "NAV"}
        benchmarkLabel={team ? "XLK + XLC" : "S&P 500 sectors"}
        showAll={one(query.all) === "1"}
        context={`${team ? "Tech & media holdings as their own portfolio" : "Today's positions"} · ${LOOKBACKS[lookback].label} of daily returns · synthetic preview`}
        stressPanel={<StressPanel results={stress} fundLabel={team ? "Tech & media" : "Fund"} />}
        stress={
          <StressTests
            {...STRESS_DETAIL}
            results={stress}
            fundLabel={team ? "Tech & media" : "Fund"}
            scopeLabel={team ? "Tech & media holdings" : "NAV"}
            benchmarkLabel={team ? "XLK + XLC" : "S&P 500 sectors"}
            transparency={transparency}
            exportQuery={null}
          />
        }
      />
    </main>
  );
}
