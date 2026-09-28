import { notFound } from "next/navigation";
import { BacktestingWorkspace } from "@/components/app/backtesting/workspace";
import { BacktestingRedesign } from "@/components/app/backtesting/redesign/backtesting-redesign";
import { LayoutSwitch } from "@/components/app/backtesting/layout-switch";
import { previewEnabled, previewSnapshot } from "@/lib/backtesting/preview";
export const dynamic = "force-dynamic";

const endpoints = {
  endpoint: "/api/dev/backtesting",
  riskEndpoint: "/api/dev/backtesting/risk",
  tickerEndpoint: "/api/dev/backtesting/ticker",
};

/** Local QA of both layouts on synthetic data: /dev/backtesting (redesign) or ?layout=classic. */
export default async function Preview({ searchParams }: PageProps<"/dev/backtesting">) {
  if (!previewEnabled()) notFound();
  const { layout } = await searchParams;
  const notice = (
    <p className="mb-4 rounded border border-dashed p-3 text-body">
      Local browser QA · synthetic prices and holdings · no live portfolio data
    </p>
  );
  if (layout === "classic")
    return (
      <main className="theme-classic mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        {notice}
        <BacktestingWorkspace
          snapshot={previewSnapshot}
          defaultFrom="2026-06-01"
          defaultTo="2026-08-31"
          {...endpoints}
          headerActions={<LayoutSwitch to="new" href="/dev/backtesting" />}
        />
      </main>
    );
  return (
    <main className="flex min-h-dvh flex-col p-6">
      {notice}
      <BacktestingRedesign
        snapshot={previewSnapshot}
        defaultFrom="2026-06-01"
        defaultTo="2026-08-31"
        {...endpoints}
        saved={[]}
        classicHref="/dev/backtesting?layout=classic"
      />
    </main>
  );
}
