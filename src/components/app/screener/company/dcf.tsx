import { fmtChangePct, fmtCompact, fmtDate, fmtPct, fmtUsd, fmtUsdCompact } from "@/lib/format";
import type { ReverseDcfResult } from "@/lib/screener/reverse-dcf";
import { StatStrip } from "@/components/app/panel";
import { DiscountRateControl } from "./discount-rate";

type Dcf = ReverseDcfResult | { status: "no_data"; reason?: string } | null;

const g = (v: number | null | undefined) => (v === null || v === undefined ? "—" : fmtChangePct(v * 100, 1));

/**
 * The reverse DCF: the five-year revenue growth today's price implies, beside the company's own history and the
 * street's next year, then how that answer moves with the discount rate and with or without ROIC fading. Numbers only.
 */
export function DcfTab({ ticker, dcf, canSetRate }: { ticker: string; dcf: Dcf; canSetRate?: boolean }) {
  if (!dcf) return <p className="border-b py-4 text-body text-muted-foreground">{ticker} isn&apos;t an SEC registrant, so there are no filings to build the cash flows from.</p>;
  if (dcf.status === "no_data" || !("inputs" in dcf) || !dcf.inputs) {
    return <p className="border-b py-4 text-body text-muted-foreground">Not enough SEC data to solve it{dcf.reason ? `: ${dcf.reason}` : "."}</p>;
  }
  const i = dcf.inputs;
  const nm = dcf.status === "not_meaningful";
  return (
    <div>
      {nm ? (
        <p className="max-w-[72ch] text-emph text-ink-2">
          Not meaningful. {dcf.reason ?? "Growth adds no value here, so the price can't be read as a growth expectation."}
        </p>
      ) : (
        <p className="max-w-[72ch] text-emph text-ink-2">
          At {i.price !== null ? fmtUsd(i.price) : "today's price"}, the market is paying for revenue growth of {g(dcf.impliedGrowth)} a year for five years, fading to {fmtPct(i.terminal * 100, 1)} by year ten.
        </p>
      )}
      <StatStrip
        className="mt-5"
        cells={[
          { label: "Implied, next 5 years", value: nm ? "Not meaningful" : g(dcf.impliedGrowth), note: `at a ${fmtPct(i.rate * 100, 0)} discount rate` },
          { label: "History, 5 years", value: g(dcf.hist5), note: "revenue CAGR" },
          { label: "History, 10 years", value: g(dcf.hist10), note: "revenue CAGR" },
          { label: "Consensus, next year", value: g(dcf.consensusNextYear), note: "consensus covers 1–2 years" },
        ]}
      />

      <section aria-labelledby="dcf-sens" className="mt-8">
        <h2 id="dcf-sens" className="text-body font-semibold">
          How it moves
        </h2>
        <div role="table" aria-label="Implied growth by discount rate" className="mt-2 max-w-[640px] text-body">
          <div role="row" className="grid h-10 grid-cols-[minmax(0,1fr)_repeat(5,72px)] items-center gap-3 border-b text-caption text-muted-foreground">
            <span role="columnheader">Discount rate</span>
            {dcf.sensitivity.map((s) => (
              <span key={s.rate} role="columnheader" className="text-right">
                {fmtPct(s.rate * 100, 0)}
              </span>
            ))}
          </div>
          {(["withFade", "withoutFade"] as const).map((k) => (
            <div key={k} role="row" className="grid min-h-10 grid-cols-[minmax(0,1fr)_repeat(5,72px)] items-center gap-3 border-b border-row">
              <span role="rowheader" className="text-ink-2" title={k === "withFade" ? "ROIC falls from today's level toward max(r + 2 points, ROIC ÷ 2) by year 10" : "ROIC held at today's level: flatters high-return companies"}>
                {k === "withFade" ? "ROIC fades" : "ROIC held"}
              </span>
              {dcf.sensitivity.map((s) => (
                <span key={s.rate} role="cell" className={`text-right tabular-nums ${Math.abs(s.rate - i.rate) < 1e-9 && k === "withFade" ? "font-semibold" : ""}`}>
                  {s[k] === null ? <span className="text-muted-foreground">n/m</span> : g(s[k])}
                </span>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-2 max-w-[72ch] text-caption text-muted-foreground">n/m: not meaningful at that rate (ROIC at or below it, so growth adds no value).</p>
      </section>

      <section aria-labelledby="dcf-inputs" className="mt-8">
        <h2 id="dcf-inputs" className="text-body font-semibold">
          Inputs
        </h2>
        <dl className="mt-2 grid max-w-[560px] grid-cols-2 gap-x-8 text-body">
          <Input label="Revenue" value={fmtUsdCompact(i.revenue)} />
          <Input label="EBIT margin, 5y average" value={fmtPct(i.margin * 100, 1)} />
          <Input label="Tax rate, 5y average" value={fmtPct(i.taxRate * 100, 1)} />
          <Input label="ROIC" value={i.roic === null ? "—" : fmtPct(i.roic * 100, 1)} />
          <Input label="Net debt" value={fmtUsdCompact(i.netDebt)} />
          <Input label="Shares" value={fmtCompact(i.shares)} />
          <Input label="Discount rate" value={fmtPct(i.rate * 100, 1)} />
          <Input label="Terminal growth" value={fmtPct(i.terminal * 100, 1)} />
        </dl>
        <p className="mt-2 max-w-[72ch] text-caption text-muted-foreground">
          From SEC filings{i.periodEnd ? `, fiscal year ended ${fmtDate(i.periodEnd)}` : ""}; price and consensus from market data as of {fmtDate(dcf.asOf)}. Growth holds five years, then fades to the terminal rate over years six to ten; reinvestment is growth over ROIC. The fund-wide discount rate is set by execs.
        </p>
        {canSetRate && (
          <div className="mt-2 text-caption">
            <DiscountRateControl rate={i.rate} />
          </div>
        )}
      </section>
    </div>
  );
}

function Input({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[34px] items-center justify-between gap-3 border-b border-row">
      <dt className="truncate text-ink-2">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
