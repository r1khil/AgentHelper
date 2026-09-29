import { CenterBar, SectionHead } from "@/components/app/portfolio/parts";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { fmtChangeBp, fmtDay } from "@/lib/format";
import type { Exposure } from "@/lib/risk/exposure";
import { FACTORS, formatBeta, isFactorReport } from "@/lib/risk/factors";
import type { LookthroughState } from "@/lib/risk/lookthrough-report";
import type { NameExposure } from "@/lib/risk/lookthrough";
import type { RiskReport } from "@/lib/risk/model";
import { cn } from "@/lib/utils";
import { Tip } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "../risk/explainers";
import { rnum, rpct, rusd } from "../risk/format";
import type { TeamNames } from "../risk/holdings-risk-table";
import { LookbackSelector } from "../risk/lookback-selector";
import { ReadAs, tickerName } from "@/components/app/read-as";
import { RowLink } from "@/components/app/row-link";

/** Active weight in basis points without the unit, e.g. "340" or "(125)"; the column header names the unit. */
const activeBp = (v: number | null) => rnum(v === null ? null : v * 10_000, 0);
const tone = (v: number | null) => (v === null || Math.abs(v) < 5e-4 ? "text-muted-foreground" : v > 0 ? "text-up" : "text-down");
const OVER = "var(--series-1)";
const UNDER = "var(--series-neutral)";

/** Sector, the Fund's weight, the benchmark's, the tilt drawn either side of zero, and the tilt in bp. */
const SECTOR_COLS = "grid grid-cols-[minmax(0,1fr)_56px_72px_minmax(90px,1.1fr)_76px] gap-x-3 xl:grid-cols-[minmax(0,1fr)_64px_84px_minmax(120px,200px)_84px]";

/**
 * "Sector weights against the benchmark": each sector's weight beside the benchmark's and the tilt between them, drawn
 * either side of a centre line: black overweight, grey underweight. The bars are decoration for the figures, so they sit
 * outside the table's cells.
 */
export function SectorTilts({ x, benchShort, weightSetAsOf }: { x: Exposure; benchShort: string; weightSetAsOf?: string | null }) {
  const rows = x.sectors.filter((s) => s.key !== "cash");
  const max = Math.max(0.005, ...rows.map((s) => Math.abs(s.active ?? 0)));
  return (
    <section id="sectors" aria-labelledby="exp-sectors" className="scroll-mt-4">
      <SectionHead
        id="exp-sectors"
        title="Sector weights against the benchmark"
        sub={
          x.hasBenchmark ? (
            <>
              Black is overweight, grey underweight. {benchShort} weights{weightSetAsOf ? ` saved ${fmtDay(weightSetAsOf)}` : ""}
              {x.throughEtfs ? ", each ETF split into its holdings" : ""}.
            </>
          ) : (
            "Add S&P 500 sector weights to compare against the benchmark."
          )
        }
      />
      <div role="table" aria-label="Sector weights" className="mt-2 text-body">
        <div role="row" className={cn(SECTOR_COLS, "min-h-[34px] items-center border-b text-caption text-muted-foreground")}>
          <span role="columnheader">Sector</span>
          <span role="columnheader" className="text-right">Fund</span>
          <span role="columnheader" className="truncate text-right">{x.hasBenchmark ? "Benchmark" : benchShort}</span>
          <span aria-hidden className="text-center">Under, over</span>
          <span role="columnheader" className="text-right"><Tip label={<ReadAs text="Tilt, active weight in basis points">Tilt</ReadAs>} side="bottom">{RISK_EXPLAIN.activeWeight}</Tip></span>
        </div>
        {rows.map((s) => (
          <div
            key={s.key}
            role="row"
            className={cn(SECTOR_COLS, "min-h-[38px] items-center border-b border-row")}
            title={`${s.label}: ${rpct(s.weight)}${s.benchWeight !== null ? ` vs ${rpct(s.benchWeight)} in ${benchShort}` : ""}${s.tickers.length ? `. ${s.tickers.join(", ")}` : ""}`}
          >
            <span role="rowheader" className="min-w-0 truncate">
              {s.label}
              {s.tickers.length > 0 && <span className="sr-only">: {s.tickers.join(", ")}</span>}
            </span>
            <span role="cell" className="text-right font-semibold">{rpct(s.weight, 1)}</span>
            <span role="cell" className="text-right text-muted-foreground">{rpct(s.benchWeight, 1)}</span>
            <span aria-hidden>{s.active !== null && <CenterBar value={s.active} max={max} color={s.active < 0 ? UNDER : OVER} className="h-3" />}</span>
            <span role="cell" className={cn("text-right font-semibold", s.active !== null && s.active < 0 ? "text-ink-2" : undefined)}>
              {s.active === null ? "—" : fmtChangeBp(s.active * 10_000)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * "Factor tilts": the portfolio's beta to each factor against the sector benchmark (or its own betas without one) as bars
 * either side of a centre line, faded where the link isn't clear (|t| below 2). The lookback window buttons live here:
 * the betas are the one thing on the page that depend on the window.
 */
export function FactorTilts({ report: r, basePath, query }: { report: RiskReport; basePath: string; query: string }) {
  const f = r.factors;
  const head = (sub: React.ReactNode, explain?: string) => (
    <SectionHead
      id="exp-factors"
      title={explain ? <Tip label="Factor tilts">{explain}</Tip> : "Factor tilts"}
      sub={sub}
      aside={<LookbackSelector basePath={basePath} active={r.lookback} extra={query} />}
    />
  );
  if (!isFactorReport(f)) {
    return (
      <section id="factors" aria-labelledby="exp-factors" className="scroll-mt-4">
        {head(f.reason)}
      </section>
    );
  }
  const fit = f.active ?? f.fund;
  // Betas of the book on its own start Market at 1.00; tilts against the benchmark start every factor at 0.
  const fromOne = !f.active;
  const rows = FACTORS.map((d) => {
    const c = fit.betas[d.key];
    return { ...d, c, s: fromOne && d.key === "market" ? c.beta - 1 : c.beta };
  });
  const max = Math.max(0.25, ...rows.map((x) => (Number.isFinite(x.s) ? Math.abs(x.s) : 0))) * 1.1;
  return (
    <section id="factors" aria-labelledby="exp-factors" className="scroll-mt-4">
      {head(
        <>
          {r.lookback.toUpperCase()} {f.active ? "beta to each factor against the sector benchmark; 0 is no tilt" : `beta to each factor. Market is drawn from 1.00, the rest from 0`}. Faded: |t| below 2, no clear link.
        </>,
        f.active ? RISK_EXPLAIN.factorActiveRow : RISK_EXPLAIN.factorBeta,
      )}
      {/* No visible header: each row is a factor, its bar and its beta. Screen readers get the header, each factor's
          definition, and the fading as words. */}
      <div role="table" aria-label="Factor tilts" className="mt-2 text-body">
        <div role="row" className="sr-only">
          <span role="columnheader">Factor</span>
          <span role="columnheader">Beta</span>
        </div>
        {rows.map((x) => (
          <div
            key={x.key}
            role="row"
            className="grid min-h-[34px] grid-cols-[80px_minmax(0,1fr)_48px] items-center gap-x-2.5 border-b border-row"
            title={`${x.definition}. β ${formatBeta(x.c.beta, 3)}, t ${formatBeta(x.c.t, 1)}${x.c.significant ? "" : " (not statistically clear)"}`}
          >
            <span role="rowheader" className="truncate">
              {x.label}
              <span className="sr-only">: {x.definition}</span>
            </span>
            <span aria-hidden style={{ opacity: x.c.significant ? 1 : 0.4 }}>
              <CenterBar value={Number.isFinite(x.s) ? x.s : 0} max={max} color={x.s < 0 ? UNDER : OVER} />
            </span>
            <span role="cell" className={cn("text-right font-semibold", !x.c.significant && "text-muted-foreground")}>
              {formatBeta(x.c.beta, 2)}
              {!x.c.significant && <span className="sr-only">, not statistically clear</span>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** "Concentration": how many positions the book really holds, how much the largest are, and the cash. */
export function Concentration({ x, report: r }: { x: Exposure; report: RiskReport }) {
  const fund = r.scope === "fund";
  const rows: { k: React.ReactNode; v: string }[] = [
    { k: <Tip label="Effective positions">{RISK_EXPLAIN.effectiveN}</Tip>, v: `${rnum(x.effectiveN, 1)} of ${x.holdingsCount}` },
    { k: <Tip label={`Top ${x.top.holdings.length} holdings`}>{RISK_EXPLAIN.top10}</Tip>, v: rpct(x.top.weight) },
    { k: <Tip label="Cash">{RISK_EXPLAIN.cash}</Tip>, v: fund ? rpct(x.cash.weight, 2) : "held at Fund level" },
  ];
  return (
    <section aria-labelledby="exp-conc">
      <SectionHead id="exp-conc" title="Concentration" />
      <dl className="mt-2 text-body">
        {rows.map((c, i) => (
          <div key={i} className="flex min-h-9 items-center justify-between border-b border-row">
            <dt className="text-ink-2">{c.k}</dt>
            <dd className="font-semibold">{c.v}</dd>
          </div>
        ))}
      </dl>
      {fund && <p className="mt-1.5 text-caption text-muted-foreground">{rusd(x.cash.value)} in cash, not in any sector.</p>}
    </section>
  );
}

const viaText = (n: NameExposure) => {
  const etfs = n.viaEtfs.map((v) => v.via).join(", ");
  if (n.direct > 5e-5) return `Direct ${rpct(n.direct, 2)}${etfs ? `, plus ${etfs}` : ""}`;
  return etfs ? `Not held directly, through ${etfs}` : "Direct";
};

/**
 * "Largest positions after look-through": every ETF split into what it holds, added to what the fund owns directly,
 * two columns of ticker, where the weight comes from and the total. Without stored ETF lists it lists the largest
 * positions as held.
 */
export function PositionsAfterLookthrough({ x, report: r, lookthrough }: { x: Exposure; report: RiskReport; lookthrough: LookthroughState | null }) {
  const lt = lookthrough?.state === "ok" ? lookthrough.report : null;
  const rows: { key: string; via: string; weight: number }[] = lt
    ? lt.names.slice(0, 12).map((n) => ({ key: n.key, via: viaText(n), weight: n.total }))
    : x.top.holdings.slice(0, 12).map((h) => ({ key: h.ticker, via: `${h.name}${sectorOf(r, h.ticker)}`, weight: h.weight }));
  return (
    <section id="positions" aria-labelledby="exp-positions" className="mt-[34px] scroll-mt-4">
      <SectionHead
        id="exp-positions"
        title={lt ? "Largest positions after look-through" : "Largest positions"}
        sub={lt ? "Every ETF split into what it holds, added to what the fund owns directly" : "As held: ETF holdings lists are needed to split the ETFs into their companies"}
      />
      <div role="table" aria-label={lt ? "Look-through" : "Largest positions"} className="mt-2 grid grid-cols-2 gap-x-14 text-body">
        <div role="row" className="sr-only">
          <span role="columnheader">Holding</span>
          <span role="columnheader">Where the weight comes from</span>
          <span role="columnheader">Weight</span>
        </div>
        {rows.map((n) => (
          <div key={n.key} role="row" className="grid min-h-10 grid-cols-[70px_minmax(0,1fr)_80px] items-center gap-3 border-b border-row">
            <b role="cell" className="font-semibold">{n.key}</b>
            <span role="cell" className="min-w-0 truncate text-muted-foreground" title={n.via}>{n.via}</span>
            <span role="cell" className="text-right font-semibold">{rpct(n.weight, 2)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const sectorOf = (r: RiskReport, ticker: string) => {
  const s = r.holdings.find((h) => h.ticker === ticker)?.sector;
  return s ? `, ${SECTOR_LABELS[s]}` : "";
};

/**
 * The largest company-level bets against the benchmark's own holdings (through the ETFs), or by sector when the
 * benchmark's holdings aren't stored.
 */
export function ActiveBetsPanel({ report: r, x, lookthrough, teams, benchShort }: { report: RiskReport; x: Exposure; lookthrough: LookthroughState | null; teams: TeamNames; benchShort: string }) {
  const lt = lookthrough?.state === "ok" ? lookthrough : null;
  const COLS = "grid grid-cols-[72px_minmax(0,1fr)_72px_72px_64px] items-center gap-x-3";
  const columns = (first: string, second: string, bench: string) => (
    <div role="row" className={cn(COLS, "min-h-[34px] border-b text-caption text-muted-foreground")}>
      <span role="columnheader">{first}</span>
      <span role="columnheader">{second}</span>
      <span role="columnheader" className="text-right">Fund</span>
      <span role="columnheader" className="truncate text-right">{bench}</span>
      <span role="columnheader" className="text-right">
        <ReadAs text="Active weight, basis points">Active, bp</ReadAs>
      </span>
    </div>
  );
  const head = (aside: string) => (
    <SectionHead id="exp-bets" title={<Tip label="Largest active bets">{lt?.report.active ? RISK_EXPLAIN.stockLargestBet : RISK_EXPLAIN.largestActiveBet}</Tip>} sub={aside} />
  );

  if (lt?.report.active) {
    const held = new Map(r.holdings.map((h) => [h.ticker, h]));
    const names = new Map(lt.report.names.map((n) => [n.key, n]));
    const rows = lt.report.active.rows.slice(0, 6);
    const bench = lt.benchmarkLabel === "SPY" ? "S&P 500" : (lt.benchmarkLabel ?? benchShort);
    return (
      <section id="stock-active" aria-labelledby="exp-bets" className="mt-[34px] scroll-mt-4">
        {head(`Against ${bench} weight, in bp`)}
        <div role="table" aria-label="Largest active bets" className="mt-2 text-body">
          {columns("Holding", "Team or sector", bench)}
          {rows.map((b) => {
            const h = held.get(b.key);
            const team = h?.teamId ? teams.get(h.teamId) : undefined;
            const n = names.get(b.key);
            const note = team?.name ?? (n?.sector ? SECTOR_LABELS[n.sector] : b.name);
            return (
              <div key={b.key} role="row" className={cn(COLS, "relative min-h-10 border-b border-row")} title={`${b.key}, ${b.name}`}>
                <span role="rowheader" className="truncate font-semibold">
                  {team ? (
                    <RowLink cover="cell" owner={team.slug} path={`/h/${encodeURIComponent(b.key)}`} aria-label={tickerName(b.key, b.name)} className="hover:underline">{b.key}</RowLink>
                  ) : (
                    b.key
                  )}
                </span>
                <span role="cell" className="min-w-0 py-1 leading-4 text-ink-2">{note}</span>
                <span role="cell" className="text-right">{rpct(b.fund, 2)}</span>
                <span role="cell" className="text-right text-muted-foreground">{rpct(b.benchmark, 2)}</span>
                <span role="cell" className={cn("text-right font-semibold", tone(b.active))}>{activeBp(b.active)}</span>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  // No benchmark holdings: the same list by sector.
  const bets = x.sectors.filter((s) => s.key !== "cash" && s.active !== null).sort((a, b) => Math.abs(b.active!) - Math.abs(a.active!)).slice(0, 6);
  return (
    <section id="stock-active" aria-labelledby="exp-bets" className="mt-[34px] scroll-mt-4">
      {head(`By sector, against ${benchShort} weight, in bp`)}
      {bets.length > 0 && (
        <div role="table" aria-label="Largest active bets by sector" className="mt-2 text-body">
          {columns("ETF", "Sector", benchShort)}
          {bets.map((s) => (
            <div key={s.key} role="row" className={cn(COLS, "min-h-10 border-b border-row")} title={s.tickers.join(", ")}>
              <span role="cell" className="truncate font-semibold">{s.etf ?? "—"}</span>
              <span role="rowheader" className="truncate text-ink-2">{s.label}</span>
              <span role="cell" className="text-right">{rpct(s.weight, 2)}</span>
              <span role="cell" className="text-right text-muted-foreground">{rpct(s.benchWeight, 2)}</span>
              <span role="cell" className={cn("text-right font-semibold", tone(s.active))}>{activeBp(s.active)}</span>
            </div>
          ))}
        </div>
      )}
      {!bets.length && <p className="mt-2 text-body text-muted-foreground">Add S&amp;P 500 sector weights to compare against the benchmark.</p>}
      {lt && !lt.report.active && lt.benchmarkMissing && <p className="mt-2 text-body text-muted-foreground">{lt.benchmarkMissing} Company-level bets need them.</p>}
    </section>
  );
}

