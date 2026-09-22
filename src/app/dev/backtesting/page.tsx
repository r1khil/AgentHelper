import { notFound } from "next/navigation";
import { BacktestingWorkspace } from "@/components/app/backtesting/workspace";
import { previewEnabled, previewSnapshot } from "@/lib/backtesting/preview";
export const dynamic = "force-dynamic";
export default function Preview() {
  if (!previewEnabled()) notFound();
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <p className="mb-4 rounded border border-dashed p-3 text-sm">
        Local browser QA · synthetic prices and holdings · no live portfolio
        data
      </p>
      <BacktestingWorkspace
        snapshot={previewSnapshot}
        defaultFrom="2026-06-01"
        defaultTo="2026-08-31"
        endpoint="/api/dev/backtesting"
      />
    </main>
  );
}
