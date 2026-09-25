import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/app/page-header";
import type { RiskReport } from "@/lib/risk/model";
import { STRESS_WINDOWS } from "@/lib/risk/stress";
import { loadStressTests } from "@/lib/risk/stress-load";
import { StressTests } from "./stress-tests";

type Props = Omit<React.ComponentProps<typeof StressTests>, "results"> & { report: RiskReport };

/** Loads the stress tests for the report's positions from stored closes; streamed in behind a Suspense boundary. */
export async function StressSection({ report, ...props }: Props) {
  const results = await loadStressTests(report);
  return <StressTests results={results} {...props} />;
}

export function StressSectionFallback() {
  return (
    <section aria-label="Historical stress tests" aria-busy className="mb-6">
      <SectionTitle>Historical stress tests</SectionTitle>
      <Card className="gap-0 p-0">
        {STRESS_WINDOWS.map((w) => (
          <div key={w.key} className="border-b px-4 py-3 pl-10 text-sm text-muted-foreground last:border-b-0">
            {w.label} · loading…
          </div>
        ))}
      </Card>
    </section>
  );
}
