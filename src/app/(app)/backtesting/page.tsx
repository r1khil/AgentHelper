import type { Metadata } from "next";
import { DateTime } from "luxon";
import { canManageTeam, isFundWide, requireOnboardedUser } from "@/lib/auth";
import { loadSnapshot } from "@/lib/backtesting/load";
import { getScenario, listScenarios, scenarioOntoSnapshot } from "@/lib/backtesting/saved";
import { fundingLabel, parseTradeParam } from "@/lib/backtesting/trade";
import { BacktestingWorkspace, type InitialScenario } from "@/components/app/backtesting/workspace";
import { SavedScenarios } from "@/components/app/backtesting/saved-scenarios";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { fmtDate } from "@/lib/format";
import { NY } from "@/lib/providers/calendar";
import { validDate } from "@/lib/backtesting/engine";
import { STRESS_WINDOWS } from "@/lib/risk/stress";
export const metadata: Metadata = { title: "Backtesting" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const BENCHMARKS = new Set(["SPY", "QQQ", "IWM"]);

export default async function BacktestingPage({ searchParams }: PageProps<"/backtesting">) {
  const user = await requireOnboardedUser();
  const query = await searchParams;
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

  // ?scenario=<id> reopens a saved what-if; ?trade=TICKER:-2:cash (from the Risk page) starts one;
  // ?from=&to= (a Risk page stress test, named by ?stress=) fills in the dates.
  const scenarioId = one(query.scenario);
  const [saved, scenario] = await Promise.all([listScenarios(user), scenarioId ? getScenario(user, scenarioId) : Promise.resolve(null)]);
  let initial: InitialScenario | undefined;
  if (scenario) {
    const mapped = scenarioOntoSnapshot(snapshot, scenario);
    const warnings = [
      mapped.changedSince && "Holdings have changed since it was saved.",
      mapped.dropped.length && `No longer held, so left out: ${mapped.dropped.join(", ")}.`,
      mapped.newSince.length && `Held now but not in the scenario, so at their saved weights: ${mapped.newSince.join(", ")}.`,
      (mapped.dropped.length || mapped.newSince.length) && "Check that the modified total is 100% before running.",
    ].filter(Boolean);
    initial = {
      weightsPct: mapped.weightsPct,
      added: scenario.added,
      from: scenario.fromDate,
      to: scenario.toDate,
      benchmark: BENCHMARKS.has(scenario.benchmark) ? (scenario.benchmark as InitialScenario["benchmark"]) : undefined,
      banner: `Opened “${scenario.name}”, saved by ${scenario.author ?? "a member"} on ${fmtDate(scenario.createdAt)}.${scenario.note ? ` ${scenario.note}` : ""} ${warnings.join(" ")}`.trim(),
    };
  } else {
    const trade = parseTradeParam(one(query.trade));
    if (trade)
      initial = {
        trade,
        banner: `Started from the Risk page: ${trade.changePp < 0 ? "trim" : "add to"} ${trade.ticker} by ${Math.abs(trade.changePp)} pp, ${trade.changePp < 0 ? "proceeds to" : "funded from"} ${fundingLabel(trade.funding)}. Change it below, then run to compare performance and risk.`,
      };
    const [from, to] = [one(query.from), one(query.to)];
    if (from && to && validDate(from) && validDate(to) && from <= to) {
      const stress = STRESS_WINDOWS.find((w) => w.key === one(query.stress));
      initial = {
        ...initial,
        from,
        to,
        banner: [
          initial?.banner,
          stress
            ? `Dates from the Risk page's ${stress.label} stress test. This replay uses the saved weights rebalanced daily, and holdings not yet listed count as cash, so it will differ from the stress test's buy-and-hold on today's ledger positions.`
            : undefined,
        ]
          .filter(Boolean)
          .join(" "),
      };
    }
  }
  // Realized returns live on Attribution, which only execs/admins (fund) and team leads (team) may open.
  const realizedHref = isFundWide(user)
    ? "/attribution"
    : user.team && canManageTeam(user, user.team.id)
      ? `/t/${user.team.slug}/attribution`
      : undefined;
  return (
    <BacktestingWorkspace
      key={scenario?.id ?? `${one(query.trade) ?? "saved"}:${one(query.from) ?? ""}:${one(query.to) ?? ""}`}
      snapshot={snapshot}
      defaultFrom={end.minus({ months: 3 }).toISODate()!}
      defaultTo={end.toISODate()!}
      initial={initial}
      saveAudience={isFundWide(user) ? "the Fund's execs and admins" : `everyone on ${user.team?.name ?? "your team"}`}
      aside={<SavedScenarios items={saved} activeId={scenario?.id} viewerId={user.id} fundWide={isFundWide(user)} />}
      realizedHref={realizedHref}
    />
  );
}
