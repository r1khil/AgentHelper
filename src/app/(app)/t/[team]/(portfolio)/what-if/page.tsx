import type { Metadata } from "next";
import { DateTime } from "luxon";
import { canManageTeam, isFundWide } from "@/lib/auth";
import { loadSnapshot, openingRun } from "@/lib/backtesting/load";
import { defaultWindow } from "@/lib/backtesting/default-run";
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
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { holdings, teams } from "@/db/schema";
import { BacktestingRedesign } from "@/components/app/backtesting/redesign/backtesting-redesign";
import { LayoutSwitch } from "@/components/app/backtesting/layout-switch";
import Link from "next/link";
import { loadScope } from "@/lib/teams";

export const metadata: Metadata = { title: "What if" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const BENCHMARKS = new Set(["SPY", "QQQ", "IWM"]);

/**
 * Portfolio, What if: today's weights replayed over past prices beside a changed copy (what Backtesting was). It
 * replays the reader's own portfolio (the fund for execs and admins, their team otherwise) whichever scope is in view.
 */
export default async function WhatIfPage({ params, searchParams }: PageProps<"/t/[team]/what-if">) {
  const scope = await loadScope((await params).team);
  const { user } = scope;
  // The replay is the reader's own portfolio, which for an exec or admin is the whole fund whatever team is in view.
  const scopeNote =
    scope.kind === "team" && isFundWide(user) ? (
      <>
        Replays the whole fund, not {scope.team.name}.{" "}
        <Link href="/t/fund/what-if" className="font-semibold text-foreground hover:underline">
          Open it on the whole fund
        </Link>
      </>
    ) : undefined;
  const query = await searchParams;
  // Each member picks the redesign (default) or the classic layout; the shell draws the matching chrome.
  const classic = user.hoot?.layouts?.backtesting === "classic";
  let snapshot;
  try {
    snapshot = await loadSnapshot(user);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load current holdings. Please retry.";
    return classic ? (
      <>
        <PageHeader
          title="Backtesting"
          description="Replay your portfolio with a different set of weights."
          actions={<LayoutSwitch to="new" />}
        />
        <EmptyState title="Portfolio weights unavailable">{message}</EmptyState>
      </>
    ) : (
      <EmptyState title="Portfolio weights unavailable" action={<LayoutSwitch to="classic" />}>
        {message}
      </EmptyState>
    );
  }
  const span = defaultWindow(DateTime.now().setZone(NY).minus({ days: 1 }).toISODate()!);
  const teamNames = classic ? Promise.resolve({}) : teamsByTicker(snapshot.positions.map((p) => p.ticker));

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
  // Realized returns live on Performance, which only execs/admins (fund) and team leads (team) may open.
  const realizedHref = isFundWide(user)
    ? "/t/fund/performance"
    : user.team && canManageTeam(user, user.team.id)
      ? `/t/${user.team.slug}/performance`
      : undefined;
  const key = scenario?.id ?? `${one(query.trade) ?? "saved"}:${one(query.from) ?? ""}:${one(query.to) ?? ""}`;
  const shared = {
    snapshot,
    defaultFrom: span.from,
    defaultTo: span.to,
    initial,
    // A plain open replays today's weights against SPY while the page streams, so the first view has results.
    // No scenario is saved and the profile is untouched; a link to a scenario, trade or dates waits for Run instead.
    openingRun: initial ? undefined : openingRun(snapshot, span.to),
    saveAudience: isFundWide(user) ? "the Fund's execs and admins" : `everyone on ${user.team?.name ?? "your team"}`,
    realizedHref,
  };
  if (classic)
    return (
      <BacktestingWorkspace
        {...shared}
        key={key}
        aside={<SavedScenarios items={saved} activeId={scenario?.id} viewerId={user.id} fundWide={isFundWide(user)} />}
        headerActions={<LayoutSwitch to="new" />}
      />
    );
  return (
    <BacktestingRedesign
      {...shared}
      key={key}
      saved={saved}
      activeId={scenario?.id}
      viewerId={user.id}
      fundWide={isFundWide(user)}
      teams={await teamNames}
      scopeNote={scopeNote}
    />
  );
}

/** Which team covers each ticker ("FIG", or "FIG / Info Tech" when two do), for the weights table. */
async function teamsByTicker(tickers: string[]): Promise<Record<string, string>> {
  if (!tickers.length) return {};
  const rows = await db
    .select({ ticker: holdings.ticker, team: teams.name })
    .from(holdings)
    .innerJoin(teams, eq(teams.id, holdings.teamId))
    .where(eq(holdings.status, "active"))
    .orderBy(teams.sortOrder)
    .catch(() => []);
  const wanted = new Set(tickers);
  const out: Record<string, string[]> = {};
  for (const r of rows) if (wanted.has(r.ticker) && !out[r.ticker]?.includes(r.team)) (out[r.ticker] ??= []).push(r.team);
  return Object.fromEntries(Object.entries(out).map(([t, names]) => [t, names.join(" / ")]));
}
