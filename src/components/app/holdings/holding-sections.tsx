import { getKeyStats } from "@/lib/providers/yahoo";
import { fmtChangeBp, fmtChangeMoney, fmtChangePct, fmtCompact, fmtCurrency, fmtDayMonth, fmtMoney, fmtNumber, fmtPct, fmtUsdCompact } from "@/lib/format";
import { loadFundPosition } from "@/lib/portfolio/holding";
import { toneOfText } from "@/components/app/portfolio/figures";
import { RailCard, type RailRow } from "./rail";

/**
 * The fund's stake, priced live, then who covers the holding (`coverage`: Team, Lead). Only for readers who see
 * position sizes; everyone else gets the coverage rows alone (see CoverageCard).
 */
export async function FundPositionCard({ ticker, coverage }: { ticker: string; coverage: RailRow[] }) {
  const p = await loadFundPosition(ticker).catch((e) => {
    console.error("[holding] fund position failed", e);
    return null;
  });
  if (!p) {
    return <RailCard id="pos-h" title="Fund position" rows={[{ k: "Shares", v: "Not held", tone: "muted" }, ...coverage]} note="The ledger holds none of it. Record a trade to open the position." />;
  }
  const signed = (text: string, title?: string): Pick<RailRow, "v" | "tone" | "title"> => ({ v: text, tone: toneOfText(text), title });
  const since = `Since the ledger opened on ${fmtDayMonth(p.inception)}`;
  const rows: RailRow[] = [
    { k: "Market value", v: fmtMoney(p.value) },
    { k: "Weight", v: fmtPct(p.weight), title: "Weight in the fund" },
    { k: "Today", ...signed(fmtChangeMoney(p.dayGain), "Today's gain") },
    { k: "Total gain", ...signed(fmtChangeMoney(p.totalGain), since) },
    { k: "Total return", ...(p.totalReturn === null ? { v: "—", tone: "muted" as const } : signed(fmtChangePct(p.totalReturn), since)) },
    { k: "Contribution today", ...(p.contributionBp === null ? { v: "—", tone: "muted" as const } : signed(fmtChangeBp(p.contributionBp, 1))) },
    { k: "Shares", v: fmtNumber(p.shares, 2) },
    { k: "Average cost", v: fmtMoney(p.averageCost), title: since },
    ...coverage,
  ];
  return <RailCard id="pos-h" title="Fund position" rows={rows} note={`Cost and gain count from the ledger's opening prices on ${fmtDayMonth(p.inception)}; cost from before then isn't in the app.`} />;
}

/** Who covers the holding, for readers who don't see position sizes. */
export function CoverageCard({ coverage }: { coverage: RailRow[] }) {
  return <RailCard id="pos-h" title="Coverage" rows={coverage} />;
}

/** Market data from Yahoo: whatever it has for this ticker, and an em dash for what it doesn't. */
export async function KeyStatsCard({ ticker, currency, asOf, industry }: { ticker: string; currency?: string; asOf: string | null; /** What the securities table says the company does. */ industry?: string | null }) {
  const s = await getKeyStats(ticker).catch(() => null);
  const dash = { v: "—", tone: "muted" as const };
  const rows: RailRow[] = [
    ...(industry ? [{ k: "Industry", v: industry, title: industry }] : []),
    { k: "Market cap", ...(s?.marketCap != null ? { v: fmtUsdCompact(s.marketCap) } : dash) },
    { k: "P/E, next 12 months", ...(s?.forwardPE != null ? { v: `${fmtNumber(s.forwardPE, 1)}x` } : dash) },
    { k: "52-week range", ...(s?.fiftyTwoWeekLow != null && s.fiftyTwoWeekHigh != null ? { v: `${fmtCurrency(s.fiftyTwoWeekLow, currency)} to ${fmtCurrency(s.fiftyTwoWeekHigh, currency)}` } : dash) },
    { k: "Avg volume, 3 months", ...(s?.avgVolume != null ? { v: fmtCompact(s.avgVolume) } : dash) },
    { k: "Dividend yield", ...(s?.dividendYield != null ? { v: fmtPct(s.dividendYield) } : dash) },
    { k: "Beta, 5 years", ...(s?.beta != null ? { v: fmtNumber(s.beta, 2) } : dash), title: "Monthly returns against the S&P 500, as Yahoo reports it" },
  ];
  return (
    <RailCard
      id="stats-h"
      title="Key statistics"
      rows={rows}
      note={s ? `Market data from Yahoo Finance${asOf ? `, ${asOf}` : ""}. Some figures are missing for funds and thinly covered names.` : "Market data from Yahoo Finance could not be loaded just now."}
    />
  );
}
