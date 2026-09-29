import { getKeyStats } from "@/lib/providers/yahoo";
import { fmtChangeBp, fmtChangeMoney, fmtChangePct, fmtCompact, fmtCurrency, fmtDayMonth, fmtMoney, fmtNumber, fmtPct, fmtUsdCompact } from "@/lib/format";
import { loadFundPosition } from "@/lib/portfolio/holding";
import { toneOfText } from "@/components/app/portfolio/figures";
import { KeyValueSection, type KeyValue } from "./holding-lists";

/** The fund's stake, priced live: shares, value, weight and what it has made. */
export async function FundPositionSection({ ticker }: { ticker: string }) {
  const p = await loadFundPosition(ticker).catch((e) => {
    console.error("[holding] fund position failed", e);
    return null;
  });
  if (!p) {
    return <KeyValueSection id="pos-h" title="Fund position" rows={[{ k: "Shares", v: <span className="text-muted-foreground">Not held</span> }]} note="The ledger holds none of it. Record a trade to open the position." />;
  }
  const money = (n: number) => fmtChangeMoney(n);
  const rows: KeyValue[] = [
    { k: "Shares", v: fmtNumber(p.shares, 2) },
    { k: "Market value", v: fmtMoney(p.value) },
    { k: "Weight in fund", v: fmtPct(p.weight) },
    { k: "Average cost", v: fmtMoney(p.averageCost), title: `Since the ledger opened on ${fmtDayMonth(p.inception)}` },
    { k: "Today's gain", v: money(p.dayGain), tone: toneOfText(money(p.dayGain)) },
    { k: "Total gain", v: money(p.totalGain), tone: toneOfText(money(p.totalGain)), title: `Since the ledger opened on ${fmtDayMonth(p.inception)}` },
    { k: "Total return", v: p.totalReturn === null ? "—" : fmtChangePct(p.totalReturn), tone: p.totalReturn === null ? null : toneOfText(fmtChangePct(p.totalReturn)) },
    { k: "Contribution today", v: p.contributionBp === null ? "—" : fmtChangeBp(p.contributionBp, 1), tone: p.contributionBp === null ? null : toneOfText(fmtChangeBp(p.contributionBp, 1)) },
  ];
  return <KeyValueSection id="pos-h" title="Fund position" rows={rows} note={`Cost and gain count from the ledger's opening prices on ${fmtDayMonth(p.inception)}; cost from before then isn't in the app.`} />;
}

/** Market data from Yahoo: whatever it has for this ticker, and an em dash for what it doesn't. */
export async function KeyStatsSection({ ticker, currency, nextEarnings, asOf }: { ticker: string; currency?: string; nextEarnings: string | null; asOf: string | null }) {
  const s = await getKeyStats(ticker).catch(() => null);
  const dash = <span className="font-normal text-muted-foreground">—</span>;
  const rows: KeyValue[] = [
    { k: "Market cap", v: s?.marketCap != null ? fmtUsdCompact(s.marketCap) : dash },
    { k: "P/E, next 12 months", v: s?.forwardPE != null ? `${fmtNumber(s.forwardPE, 1)}x` : dash },
    { k: "52-week range", v: s?.fiftyTwoWeekLow != null && s.fiftyTwoWeekHigh != null ? `${fmtCurrency(s.fiftyTwoWeekLow, currency)} – ${fmtCurrency(s.fiftyTwoWeekHigh, currency)}` : dash },
    { k: "Avg volume, 3 months", v: s?.avgVolume != null ? fmtCompact(s.avgVolume) : dash },
    { k: "Dividend yield", v: s?.dividendYield != null ? fmtPct(s.dividendYield) : dash },
    { k: "Beta, 5 years", v: s?.beta != null ? fmtNumber(s.beta, 2) : dash, title: "Monthly returns against the S&P 500, as Yahoo reports it" },
    { k: "Next earnings", v: nextEarnings ?? dash },
  ];
  return (
    <KeyValueSection
      id="stats-h"
      title="Key statistics"
      rows={rows}
      note={s ? `Market data from Yahoo Finance${asOf ? `, ${asOf}` : ""}. Some figures are missing for funds and thinly covered names.` : "Market data from Yahoo Finance could not be loaded just now."}
    />
  );
}
