import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { fmtChangeBp, fmtDate, fmtDay } from "@/lib/format";
import { SOURCE_LABELS } from "@/lib/lookthrough/parse";
import { describeExposure, type ActiveName, type EtfCoverage, type LookthroughReport, type NameExposure } from "@/lib/risk/lookthrough";
import { STALE_AFTER_DAYS, type LookthroughState } from "@/lib/risk/lookthrough-report";
import { cn } from "@/lib/utils";
import { CenterBar, ShareBar, Signed } from "@/components/app/portfolio/parts";
import { Explained } from "../attribution/info-tip";
import { RISK_EXPLAIN } from "../risk/explainers";
import { rnum, rpct } from "../risk/format";
import { Source, Step, Working } from "../risk/working";
import type { SectorBet } from "@/lib/risk/exposure";
import { ExposureSection } from "./exposure-section";
import { ActiveShareWorking, StockBetWorking } from "./lookthrough-cards";

/** Query parameter for the sector view: `?sectors=etf` shows sector weights through the ETFs. */
export const SECTOR_VIEW_PARAM = "sectors";
export const parseThroughEtfs = (v: string | undefined) => v === "etf";
export const sectorViewQuery = (throughEtfs: boolean) => (throughEtfs ? `&${SECTOR_VIEW_PARAM}=etf` : "");

const TOP_NAMES = 15;
const TOP_ACTIVE = 8;
export const LOOKTHROUGH_ANCHOR = "lookthrough";
/** The summary panel on the first screen owns `#stock-active`; the full tables below use this. */
export const STOCK_ACTIVE_ANCHOR = "stock-active-detail";

/**
 * The look-through sections for the Exposure page: coverage per ETF, combined exposure per company, and stock-level
 * active weights. Every state is shown, including no lists yet, stale lists and Yahoo's top 10.
 */
export function LookthroughSections({ state, scope, transparency, download, sectorBet = null }: { state: LookthroughState | null; scope: "fund" | "team"; transparency: boolean; download?: React.ReactNode; sectorBet?: SectorBet | null }) {
  if (!state || state.state === "unavailable") {
    const held = state?.heldEtfs ?? [];
    return (
      <ExposureSection id={LOOKTHROUGH_ANCHOR} title="Through the ETFs" explain={RISK_EXPLAIN.lookthrough}>
        <p className="text-body text-muted-foreground">
          {state?.reason === "no-table"
            ? "ETF holdings aren't set up yet (migration 0021). Once they are, the nightly price job stores each held ETF's full holdings weekly."
            : "No ETF holdings lists are stored yet. The nightly price job fetches them from each issuer weekly."}
          {held.length > 0 && <> ETFs held: {held.join(", ")}.</>}
        </p>
      </ExposureSection>
    );
  }
  const lt = state.report;
  const lookedThrough = lt.etfs.reduce((s, e) => s + e.lookedThrough, 0);
  const etfWeight = lt.etfs.reduce((s, e) => s + e.weight, 0);
  const overlaps = lt.names.filter((n) => n.overlap);
  return (
    <>
      <ExposureSection
        id={LOOKTHROUGH_ANCHOR}
        title="Through the ETFs"
        explain={RISK_EXPLAIN.lookthrough}
        aside={lt.etfs.length ? `${lt.etfs.length} ETFs, ${rpct(etfWeight)} of the portfolio, ${rpct(etfWeight > 0 ? lookedThrough / etfWeight : 0)} of it looked through` : "No ETFs held"}
      >
        {lt.etfs.length > 0 && <EtfCoverageTable etfs={lt.etfs} stale={state.stale} />}
        {overlaps.length > 0 && (
          <p className="mb-3 text-body text-muted-foreground">
            <Explained label="Held both ways">{RISK_EXPLAIN.overlap}</Explained>: {overlaps.map((n) => `${n.key} ${rpct(n.total)}`).join(", ")}
          </p>
        )}
        <CombinedExposureTable lt={lt} scope={scope} transparency={transparency} />
        {download && <p className="mt-2 text-caption text-muted-foreground">{download}</p>}
      </ExposureSection>
      <ExposureSection
        id={STOCK_ACTIVE_ANCHOR}
        title="Stock-level active weights"
        explain={RISK_EXPLAIN.stockActive}
        aside={lt.active ? `vs ${state.benchmarkLabel} holdings as of ${fmtDate(lt.active.benchmark.asOf)}${state.benchmarkStale ? " (stale)" : ""}, Active Share ${rpct(lt.active.activeShare)}` : undefined}
      >
        {lt.active ? (
          <>
            <p className="mb-2.5 text-body text-ink-2">
              {lt.active.largestBet && (
                <>
                  Largest bet by company: <span className="font-semibold text-foreground">{lt.active.largestBet.key}</span>{" "}
                  <Signed text={fmtChangeBp(lt.active.largestBet.active * 10_000)} /> ({rpct(lt.active.largestBet.fund)} vs {rpct(lt.active.largestBet.benchmark)}).{" "}
                </>
              )}
              <Explained label="Active Share">{RISK_EXPLAIN.activeShare}</Explained> {rpct(lt.active.activeShare)} vs {state.benchmarkLabel}&apos;s {lt.active.rows.filter((r) => r.benchmark > 0).length} companies; {rpct(lt.active.overlapWithBenchmark)} of the portfolio is in index names.
            </p>
            <StockActiveTables rows={lt.active.rows} benchmarkLabel={state.benchmarkLabel ?? "benchmark"} />
            {transparency && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <StockBetWorking lt={lt} sectorBet={sectorBet} benchmarkLabel={state.benchmarkLabel ?? "the benchmark"} />
                <ActiveShareWorking lt={lt} />
              </div>
            )}
          </>
        ) : (
          <p className="text-body text-muted-foreground"><b className="font-semibold text-caution-foreground">Missing</b> {state.benchmarkMissing ?? "The benchmark's holdings aren't stored yet."} Stock-level active weights need them.</p>
        )}
      </ExposureSection>
    </>
  );
}

const STATUS: Record<EtfCoverage["status"], { label: string; tone: string }> = {
  full: { label: "Full list", tone: "text-muted-foreground" },
  partial: { label: "Partial", tone: "text-caution-foreground" },
  "top-holdings": { label: "Top 10 only", tone: "text-caution-foreground" },
  none: { label: "No list", tone: "text-caution-foreground" },
};

function EtfCoverageTable({ etfs, stale }: { etfs: EtfCoverage[]; stale: string[] }) {
  return (
    <div className="mb-3 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ETF</TableHead>
            <TableHead className="text-right">Weight</TableHead>
            <TableHead><Explained label="Looked through">{RISK_EXPLAIN.lookthroughCoverage}</Explained></TableHead>
            <TableHead className="hidden sm:table-cell">Holdings as of</TableHead>
            <TableHead className="text-right"><Explained align="right" label="Not looked through">{RISK_EXPLAIN.notLookedThrough}</Explained></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {etfs.map((e) => {
            const s = STATUS[e.status];
            const isStale = stale.includes(e.etf);
            return (
              <TableRow key={e.etf}>
                <TableCell>
                  <span className="font-semibold">{e.etf}</span>
                  <div className={cn("text-caption", s.tone)}>
                    {s.label}
                    {e.names > 0 && <span className="text-muted-foreground">, {e.names} names</span>}
                  </div>
                  {/* On a phone the as-of column is hidden, so the date and source sit under the ETF. */}
                  {e.asOf && e.source && (
                    <div className={cn("text-caption text-muted-foreground sm:hidden", isStale && "font-semibold text-caution-foreground")}>
                      {fmtDay(e.asOf)}, {SOURCE_LABELS[e.source]}{isStale && ", stale"}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right text-body">{rpct(e.weight, 2)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <ShareBar value={e.coverage} max={1} className="w-24" />
                    <span className="w-12 text-body">{rpct(e.coverage)}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden text-body sm:table-cell">
                  {e.asOf && e.source ? (
                    <>
                      <span className={cn(isStale && "font-semibold text-caution-foreground")}>{fmtDay(e.asOf)}{isStale && ", stale"}</span>
                      <div className="text-caption text-muted-foreground">{SOURCE_LABELS[e.source]}</div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-body">{e.notLookedThrough > 5e-5 ? rpct(e.notLookedThrough, 2) : "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {stale.length > 0 && <p className="border-t py-2 text-body text-muted-foreground"><b className="font-semibold text-caution-foreground">Stale</b> Holdings more than {STALE_AFTER_DAYS} days older than the positions. The weekly refresh retries each night until it succeeds.</p>}
    </div>
  );
}

const viaText = (n: NameExposure) => n.viaEtfs.map((v) => `${rpct(v.weight, 2)} ${v.via}`).join(", ");

function CombinedExposureTable({ lt, scope, transparency }: { lt: LookthroughReport; scope: "fund" | "team"; transparency: boolean }) {
  const shown = lt.names.slice(0, TOP_NAMES);
  const rest = lt.names.slice(TOP_NAMES);
  const restTotal = rest.reduce((s, n) => s + n.total, 0);
  const max = shown[0]?.total ?? 0;
  const top = shown.find((n) => n.overlap) ?? shown[0];
  const notLookedText = lt.notLookedThrough.byEtf.map((l) => `${rpct(l.weight, 2)} ${l.via}`).join(", ");
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead><Explained label="Total">{RISK_EXPLAIN.combinedExposure}</Explained></TableHead>
            <TableHead className="text-right">Direct</TableHead>
            <TableHead className="hidden sm:table-cell">Through ETFs</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((n) => (
            <TableRow key={n.key}>
              <TableCell>
                <span className="font-semibold">{n.key}</span>
                {n.overlap && <span className="ml-1.5 text-caption font-semibold text-muted-foreground" title={RISK_EXPLAIN.overlap}>both</span>}
                <div className="max-w-56 text-caption whitespace-normal text-muted-foreground">
                  {n.name}
                  {n.sector ? `, ${SECTOR_LABELS[n.sector]}` : ""}
                  {n.symbols.length > 1 ? `, ${n.symbols.join(" + ")}` : ""}
                </div>
                {/* On a phone the "Through ETFs" column is hidden, so the breakdown sits under the name. */}
                {n.viaEtfs.length > 0 && <div className="max-w-44 text-caption whitespace-normal text-muted-foreground sm:hidden">via {viaText(n)}</div>}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <ShareBar value={n.total} max={max} className="hidden w-20 sm:block" />
                  <span className="w-12 text-body font-semibold">{rpct(n.total, 2)}</span>
                </div>
              </TableCell>
              <TableCell className="text-right text-body">{n.direct > 0 ? rpct(n.direct, 2) : "—"}</TableCell>
              {/* Wraps, so a long list of ETFs doesn't push the table past a 1,045 px window. */}
              <TableCell className="hidden min-w-32 text-body whitespace-normal text-muted-foreground sm:table-cell">{viaText(n) || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          {rest.length > 0 && (
            <TableRow>
              <TableCell className="text-body text-muted-foreground">Other {rest.length} companies</TableCell>
              <TableCell className="text-body text-muted-foreground">{rpct(restTotal, 2)}</TableCell>
              <TableCell />
              <TableCell className="hidden sm:table-cell" />
            </TableRow>
          )}
          <TableRow>
            <TableCell className="text-body text-muted-foreground">
              <Explained label="Not looked through">{RISK_EXPLAIN.notLookedThrough}</Explained>
              {notLookedText && <div className="max-w-44 text-caption whitespace-normal sm:hidden">{notLookedText}</div>}
            </TableCell>
            <TableCell className="text-body text-muted-foreground">{rpct(lt.notLookedThrough.total, 2)}</TableCell>
            <TableCell />
            <TableCell className="hidden text-body whitespace-normal text-muted-foreground sm:table-cell">{notLookedText || "—"}</TableCell>
          </TableRow>
          {(scope === "fund" || lt.cash !== 0) && (
            <TableRow>
              <TableCell className="text-body text-muted-foreground">Cash</TableCell>
              <TableCell className="text-body text-muted-foreground">{rpct(lt.cash, 2)}</TableCell>
              <TableCell />
              <TableCell className="hidden sm:table-cell" />
            </TableRow>
          )}
          <TableRow>
            <TableCell className="text-body font-semibold">Total <span className="font-normal text-muted-foreground">{lt.names.length} companies</span></TableCell>
            <TableCell className="text-body font-semibold">{rpct(lt.total, 2)}</TableCell>
            <TableCell />
            <TableCell className="hidden sm:table-cell" />
          </TableRow>
        </TableFooter>
      </Table>
      {transparency && top && (
        <div className="pt-1">
          <Working>
            <Step label="Example">{describeExposure(top)}</Step>
            {top.viaEtfs.slice(0, 3).map((v) => {
              const etf = lt.etfs.find((e) => e.etf === v.via);
              return etf ? <Step key={v.via} label={v.via}>{rpct(etf.weight, 2)} of the portfolio × {rpct(v.weight / etf.weight, 2)} of {v.via} = {rpct(v.weight, 3)}</Step> : null;
            })}
            <Step label="Check">companies {rpct(lt.names.reduce((s, n) => s + n.total, 0), 2)} + not looked through {rpct(lt.notLookedThrough.total, 2)} + cash {rpct(lt.cash, 2)} = <b>{rpct(lt.total, 2)}</b></Step>
            <Source>today&apos;s positions and each ETF&apos;s stored holdings list (dates and sources in the table above).</Source>
          </Working>
        </div>
      )}
    </div>
  );
}

function StockActiveTables({ rows, benchmarkLabel }: { rows: ActiveName[]; benchmarkLabel: string }) {
  const over = rows.filter((r) => r.active > 0).sort((a, b) => b.active - a.active).slice(0, TOP_ACTIVE);
  const under = rows.filter((r) => r.active < 0).sort((a, b) => a.active - b.active).slice(0, TOP_ACTIVE);
  const max = Math.max(...[...over, ...under].map((r) => Math.abs(r.active)), 0);
  const list = (title: string, items: ActiveName[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{title}</TableHead>
            <TableHead className="text-right">Portfolio, {benchmarkLabel}</TableHead>
            <TableHead className="text-right">Active, bp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((r) => (
            <TableRow key={r.key}>
              <TableCell>
                <span className="font-semibold">{r.key}</span>
                <div className="max-w-44 text-caption whitespace-normal text-muted-foreground">{r.name}</div>
              </TableCell>
              <TableCell className="text-right text-body">
                {rpct(r.fund, 2)} <span className="text-muted-foreground">, {rpct(r.benchmark, 2)}</span>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  <CenterBar value={r.active} max={max} className="hidden w-14 sm:block" />
                  <span className="w-14 text-right text-body sm:w-16">{rnum(r.active * 10_000, 0)}</span>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!items.length && (
            <TableRow>
              <TableCell colSpan={3} className="text-body text-muted-foreground">None</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
  return (
    <div className="grid gap-x-14 gap-y-3 lg:grid-cols-2">
      {list("Largest overweights", over)}
      {list("Largest underweights", under)}
    </div>
  );
}
