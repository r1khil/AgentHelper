import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { DataNoticesButton } from "@/components/app/attribution/data-quality-notice";
import { PageContextPublisher } from "@/components/app/hoot/page-context";
import { riskNotices } from "@/components/app/risk/notices";
import { RiskView } from "@/components/app/risk/risk-view";
import { listAccessibleTeams, requireRole, transparencyEnabled } from "@/lib/auth";
import { loadRisk } from "@/lib/risk/load";
import { LOOKBACKS, parseLookback } from "@/lib/risk/model";

export const metadata: Metadata = { title: "Fund risk" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function RiskPage({ searchParams }: PageProps<"/risk">) {
  const user = await requireRole("exec", "admin");
  const query = await searchParams;
  const lookback = parseLookback(one(query.lookback));
  const [loaded, teamList] = await Promise.all([loadRisk(lookback, null), listAccessibleTeams(user)]);

  if (loaded.state !== "ok") {
    return (
      <>
        <PageHeader title="Fund risk" />
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
      <PageHeader
        title="Fund risk"
        description={`Today's positions · ${LOOKBACKS[lookback].label} of daily returns · vs S&P 500 and sector benchmark`}
        actions={<DataNoticesButton notices={riskNotices(report.notices, { canEdit: true })} />}
      />
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
      />
    </>
  );
}
