import type { RiskReport } from "@/lib/risk/model";
import { STRESS_WINDOWS } from "@/lib/risk/stress";
import { loadStressTests } from "@/lib/risk/stress-load";
import { SectionHead } from "./section-head";
import { STRESS_DETAIL, StressPanel, StressPanelFallback } from "./stress-panel";
import { StressTests } from "./stress-tests";

type Props = Omit<React.ComponentProps<typeof StressTests>, "results"> & { report: RiskReport };

/**
 * Loads the stress tests for the report's positions from stored closes; streamed in behind a Suspense boundary.
 * The loader is cached per request, so the summary panel and the detail below share one load.
 */
export async function StressSection({ report, ...props }: Props) {
  const results = await loadStressTests(report);
  return <StressTests results={results} {...STRESS_DETAIL} {...props} />;
}

/** The summary panel beside "Where the risk comes from". */
export async function StressPanelSection({ report, fundLabel, className }: { report: RiskReport; fundLabel: string; className?: string }) {
  const results = await loadStressTests(report);
  return <StressPanel results={results} fundLabel={fundLabel} className={className} />;
}

export { StressPanelFallback };

export function StressSectionFallback() {
  return (
    <section aria-label={STRESS_DETAIL.label} aria-busy>
      <SectionHead>{STRESS_DETAIL.title}</SectionHead>
      <div className="panel">
        {STRESS_WINDOWS.map((w) => (
          <div key={w.key} className="border-b border-row px-4 py-3 pl-10 text-body text-muted-foreground last:border-b-0">
            {w.label} · loading…
          </div>
        ))}
      </div>
    </section>
  );
}
