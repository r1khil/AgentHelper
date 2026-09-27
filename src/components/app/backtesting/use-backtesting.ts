"use client";

import { useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import { usePageContext } from "@/components/app/hoot/page-context";
import { BENCHMARKS, type BacktestResult, type Position, type Snapshot } from "@/lib/backtesting/engine";
import {
  addedPositionId,
  MAX_SCENARIO_COMPANIES,
  normalizeScenarioTicker,
  withAddedCompanies,
} from "@/lib/backtesting/scenario";
import { applyTrade, fundingIds, fundingLabel, toPercentStrings, type Trade } from "@/lib/backtesting/trade";
import type { ScenarioRisk } from "@/lib/risk/compare";

// The backtesting page's state and requests, shared by the redesigned and the classic layout so both run the same
// engine through the same endpoints. Each layout only decides how to draw it.

/** A scenario to open with: a saved one (weights by ticker), or a trade from a Risk page link. */
export type InitialScenario = {
  weightsPct?: Record<string, number>;
  added?: { ticker: string; name: string }[];
  from?: string;
  to?: string;
  benchmark?: keyof typeof BENCHMARKS;
  trade?: Trade;
  /** Shown above the form: which scenario was opened, and anything that no longer matches. */
  banner?: string;
};

export type Benchmark = keyof typeof BENCHMARKS;

export const initialWeights = (snapshot: Snapshot) =>
  Object.fromEntries(snapshot.positions.map((p) => [p.id, (p.weight * 100).toFixed(2)]));

/** Every position whose weight differs from the saved copy by more than rounding is marked edited. */
function openScenario(snapshot: Snapshot, initial?: InitialScenario) {
  const added = initial?.added ?? [];
  const positions = withAddedCompanies(snapshot, added).positions;
  const weights: Record<string, string> = Object.fromEntries(positions.map((p) => [p.id, (p.weight * 100).toFixed(2)]));
  const edited = new Set<string>();
  let problem = "";
  if (initial?.weightsPct) {
    for (const p of positions) {
      const w = initial.weightsPct[p.ticker];
      if (w === undefined || Math.abs(w / 100 - p.weight) < 5e-5) continue;
      weights[p.id] = w.toFixed(2);
      edited.add(p.id);
    }
  }
  if (initial?.trade) {
    try {
      const next = applyTrade(positions, Object.fromEntries(positions.map((p) => [p.id, p.weight])), initial.trade);
      const changed = positions.filter((p) => Math.abs(next[p.id] - p.weight) > 1e-9).map((p) => p.id);
      const strings = toPercentStrings(next, fundingIds(positions, initial.trade));
      for (const id of changed) {
        weights[id] = strings[id];
        edited.add(id);
      }
    } catch (e) {
      problem = e instanceof Error ? e.message : "That trade could not be applied.";
    }
  }
  return { added, weights, edited, problem };
}

export type Completed = {
  id: number;
  result: BacktestResult;
  weights: Record<string, string>;
  from: string;
  to: string;
  benchmark: Benchmark;
};

export type BacktestingOptions = {
  snapshot: Snapshot;
  defaultFrom: string;
  defaultTo: string;
  endpoint?: string;
  tickerEndpoint?: string;
  /** Null turns the risk comparison off (the synthetic preview has no stored prices). */
  riskEndpoint?: string | null;
  initial?: InitialScenario;
};

export function useBacktesting({
  snapshot,
  defaultFrom,
  defaultTo,
  endpoint = "/api/backtesting",
  tickerEndpoint = "/api/backtesting/ticker",
  riskEndpoint = "/api/backtesting/risk",
  initial,
}: BacktestingOptions) {
  const [opened] = useState(() => openScenario(snapshot, initial));
  const [weights, setWeights] = useState(opened.weights);
  const [edited, setEdited] = useState<Set<string>>(opened.edited);
  const [added, setAdded] = useState<{ ticker: string; name: string }[]>(opened.added);
  const [tickerInput, setTickerInput] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [from, setFrom] = useState(initial?.from ?? defaultFrom),
    [to, setTo] = useState(initial?.to && initial.to <= defaultTo ? initial.to : defaultTo);
  const [benchmark, setBenchmark] = useState<Benchmark>(initial?.benchmark ?? "SPY");
  const [risk, setRisk] = useState<{ data: ScenarioRisk | null; busy: boolean; error: string; for: string }>({ data: null, busy: false, error: "", for: "" });
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const inFlight = useRef(false),
    runs = useRef(0),
    lookupInFlight = useRef(false);
  const positions = withAddedCompanies(snapshot, added).positions;
  const values = positions.map((p) => weights[p.id] ?? "");
  const scenarioWeights = Object.fromEntries(
    positions.map((p) => [p.id, edited.has(p.id) ? Number(weights[p.id]) / 100 : p.weight]),
  );
  const sum = Object.values(scenarioWeights).reduce((s, w) => s + w, 0) * 100;
  const valid =
    values.every((w) => w.trim() !== "" && Number.isFinite(Number(w)) && Number(w) >= 0 && Number(w) <= 100) &&
    Math.abs(sum - 100) < 1e-6;
  const dirty =
    completed &&
    (completed.from !== from ||
      completed.to !== to ||
      completed.benchmark !== benchmark ||
      JSON.stringify(completed.weights) !== JSON.stringify(weights));
  // Hoot attaches the scenario on screen to a question asked from this page.
  const pathname = usePathname();
  const round2 = (n: number) => Math.round(n * 100) / 100;
  usePageContext(
    /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)
      ? {
          kind: "backtesting",
          path: pathname,
          title: "Backtesting",
          from,
          to,
          benchmark,
          addedTickers: added.map((p) => p.ticker),
          changed: positions
            .filter((p) => {
              const w = scenarioWeights[p.id];
              return weights[p.id]?.trim() !== "" && Number.isFinite(w) && w >= 0 && w <= 1 && Math.abs(w - p.weight) > 1e-8;
            })
            .map((p) => ({ ticker: p.ticker, savedPct: round2(p.weight * 100), scenarioPct: round2(scenarioWeights[p.id] * 100) })),
          ran: Boolean(completed && !dirty),
        }
      : null,
  );

  /** Typing into a weight: only up to three digits and two decimals are accepted. */
  function editWeight(id: string, value: string) {
    if (!/^\d{0,3}(?:\.\d{0,2})?$/.test(value)) return;
    setWeights((current) => ({ ...current, [id]: value }));
    setEdited((current) => new Set(current).add(id));
  }
  /** Leaving a weight field writes it back with two decimals. */
  function settleWeight(id: string, raw: string) {
    const value = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(value)) setWeights((current) => ({ ...current, [id]: value.toFixed(2) }));
  }
  function dropPosition(id: string) {
    setWeights((current) => ({ ...current, [id]: "0.00" }));
    setEdited((current) => new Set(current).add(id));
  }
  function restorePosition(p: Position) {
    setWeights((current) => ({ ...current, [p.id]: (p.weight * 100).toFixed(2) }));
    setEdited((current) => {
      const next = new Set(current);
      next.delete(p.id);
      return next;
    });
  }
  function resetWeights() {
    setWeights(initialWeights(snapshot));
    setEdited(new Set());
    setAdded([]);
    setTickerInput("");
    setLookupError("");
  }
  function changeTickerInput(value: string) {
    setTickerInput(value);
    setLookupError("");
  }

  async function addCompany() {
    if (lookupInFlight.current) return;
    setLookupError("");
    let ticker: string;
    try {
      ticker = normalizeScenarioTicker(tickerInput);
      if (positions.some((p) => p.ticker.toUpperCase() === ticker))
        throw new Error(`${ticker} is already in this portfolio or scenario.`);
      if (added.length >= MAX_SCENARIO_COMPANIES)
        throw new Error(`Add at most ${MAX_SCENARIO_COMPANIES} companies to one scenario.`);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Enter a valid ticker.");
      return;
    }
    lookupInFlight.current = true;
    setLookupBusy(true);
    try {
      const response = await fetch(tickerEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.redirected || !response.headers.get("content-type")?.includes("application/json"))
        throw new Error("Your session expired. Sign in again, then reload this page.");
      const company = await response.json();
      if (!response.ok) throw new Error(company.error ?? `Could not recognize ${ticker}.`);
      const canonical = normalizeScenarioTicker(company.ticker);
      if (typeof company.name !== "string" || !company.name.trim())
        throw new Error(`Could not recognize ${ticker}.`);
      const next = [...added, { ticker: canonical, name: company.name }];
      withAddedCompanies(snapshot, next);
      setAdded(next);
      setWeights((current) => ({ ...current, [addedPositionId(canonical)]: "0.00" }));
      setTickerInput("");
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Could not add this ticker.");
    } finally {
      lookupInFlight.current = false;
      setLookupBusy(false);
    }
  }
  function removeAdded(ticker: string) {
    const id = addedPositionId(ticker);
    setAdded((current) => current.filter((p) => p.ticker !== ticker));
    setWeights((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setEdited((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }
  function quickTrade(trade: Trade): string | null {
    try {
      const next = applyTrade(positions, scenarioWeights, trade);
      const changed = positions.filter((p) => Math.abs(next[p.id] - scenarioWeights[p.id]) > 1e-9).map((p) => p.id);
      // A team sleeve's saved weights are not whole hundredths, so write every weight to keep the total exact.
      const sleeve = positions.some((p) => Math.abs(p.weight * 10_000 - Math.round(p.weight * 10_000)) > 1e-6);
      const strings = toPercentStrings(next, fundingIds(positions, trade));
      const ids = sleeve ? positions.map((p) => p.id) : changed;
      setWeights((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, strings[id]])) }));
      setEdited((current) => new Set([...current, ...ids]));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : `Could not apply the trade with ${fundingLabel(trade.funding)}.`;
    }
  }
  async function measureRisk(key: string) {
    if (!riskEndpoint) return;
    setRisk((r) => ({ ...r, busy: true, error: "" }));
    try {
      const response = await fetch(riskEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: snapshot.version, weights: scenarioWeights, addedTickers: added.map((p) => p.ticker) }),
        signal: AbortSignal.timeout(60000),
      });
      if (response.redirected || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Your session expired. Sign in again, then reload this page.");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Risk could not be measured.");
      setRisk({ data, busy: false, error: "", for: key });
    } catch (e) {
      setRisk({ data: null, busy: false, error: e instanceof Error ? e.message : "Risk could not be measured.", for: key });
    }
  }
  async function save(name: string, note: string) {
    try {
      const response = await fetch("/api/backtesting/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ...(note ? { note } : {}), version: snapshot.version, weights: scenarioWeights, addedTickers: added.map((p) => p.ticker), from, to, benchmark }),
      });
      const data = await response.json().catch(() => ({}));
      return response.ok ? { id: data.id as string } : { error: (data.error as string) ?? "Could not save the scenario." };
    } catch {
      return { error: "Could not save the scenario. Please retry." };
    }
  }
  async function run(event: FormEvent) {
    event.preventDefault();
    if (!valid || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    void measureRisk(JSON.stringify(weights));
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          benchmark,
          version: snapshot.version,
          weights: scenarioWeights,
          addedTickers: added.map((p) => p.ticker),
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (response.redirected || !response.headers.get("content-type")?.includes("application/json"))
        throw new Error("Your session expired. Sign in again, then reload this page.");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to replay this period.");
      setCompleted({ id: ++runs.current, result, weights: { ...weights }, from, to, benchmark });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to run backtest. Please retry.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return {
    snapshot,
    opened,
    positions,
    weights,
    edited,
    added,
    scenarioWeights,
    sum,
    valid,
    dirty: Boolean(dirty),
    from,
    setFrom,
    to,
    setTo,
    benchmark,
    setBenchmark,
    tickerInput,
    changeTickerInput,
    lookupBusy,
    lookupError,
    risk,
    riskStale: risk.for !== JSON.stringify(weights),
    riskEnabled: Boolean(riskEndpoint),
    completed,
    busy,
    error,
    editWeight,
    settleWeight,
    dropPosition,
    restorePosition,
    resetWeights,
    addCompany,
    removeAdded,
    quickTrade,
    save,
    run,
  };
}

export type BacktestingState = ReturnType<typeof useBacktesting>;
