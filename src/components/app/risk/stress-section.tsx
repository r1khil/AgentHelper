import type { RiskReport } from "@/lib/risk/model";
import { loadStressTests } from "@/lib/risk/stress-load";
import { StressPanelFallback } from "./stress-panel";
import { StressTests } from "./stress-tests";

type Props = Omit<React.ComponentProps<typeof StressTests>, "results"> & { report: RiskReport };

/** Loads the stress tests for the report's positions from stored closes; streamed in behind a Suspense boundary. */
export async function StressSection({ report, ...props }: Props) {
  const results = await loadStressTests(report);
  return <StressTests results={results} {...props} />;
}

/** The stress tests' shape while their older stored closes load. */
export function StressSectionFallback() {
  return <StressPanelFallback className="mt-[34px]" />;
}
