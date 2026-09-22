import type { Metadata } from "next";
import { DateTime } from "luxon";
import { requireOnboardedUser } from "@/lib/auth";
import { loadSnapshot } from "@/lib/backtesting/load";
import { BacktestingWorkspace } from "@/components/app/backtesting/workspace";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { NY } from "@/lib/providers/calendar";
export const metadata: Metadata = { title: "Backtesting" };
export default async function BacktestingPage() {
  const user = await requireOnboardedUser();
  let snapshot;
  try {
    snapshot = await loadSnapshot(user);
  } catch (error) {
    return (
      <>
        <PageHeader
          title="Backtesting"
          description="Replay your portfolio with a different set of weights."
        />
        <EmptyState title="Portfolio weights unavailable">
          {error instanceof Error
            ? error.message
            : "Unable to load current holdings. Please retry."}
        </EmptyState>
      </>
    );
  }
  const end = DateTime.now().setZone(NY).minus({ days: 1 });
  return (
    <BacktestingWorkspace
      snapshot={snapshot}
      defaultFrom={end.minus({ months: 3 }).toISODate()!}
      defaultTo={end.toISODate()!}
    />
  );
}
