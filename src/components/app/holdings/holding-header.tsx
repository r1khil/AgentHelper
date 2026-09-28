import { fmtCurrency, ppToBp } from "@/lib/format";
import { Move } from "@/components/app/move";
import { Pill } from "@/components/app/panel";

export type HeaderQuote = { price: number; currency?: string; changePct?: number; relativePp?: number; when: string } | { error: string };

/**
 * The ticker, company and team, price and moves inline, with the page's actions on the right. The way back up to
 * Holdings is in the app header (nav.ts backFor), so there's no breadcrumb here.
 */
export function HoldingHeader({
  team,
  ticker,
  company,
  exited,
  quote,
  actions,
}: {
  /** The holding's team, which the fund scope doesn't otherwise show. */
  team: string;
  ticker: string;
  company: string;
  exited?: boolean;
  quote: HeaderQuote;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-end gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-mono text-[28px] leading-tight font-semibold tracking-[-0.02em]">{ticker}</h1>
          <span className="text-base whitespace-nowrap text-ink-2">
            {company}
            <span className="text-muted-foreground"> · {team}</span>
          </span>
          {exited && <Pill className="self-center">Exited</Pill>}
          {"error" in quote ? (
            <span className="text-[13px] text-muted-foreground">{quote.error}</span>
          ) : (
            <>
              <span className="ml-2 font-mono text-lg font-medium tabular-nums">{fmtCurrency(quote.price, quote.currency)}</span>
              <Move value={quote.changePct} unit="%" digits={2} className="text-sm" />
              <span className="text-[13px] whitespace-nowrap text-muted-foreground">
                vs S&amp;P <Move value={ppToBp(quote.relativePp)} unit=" bp" digits={0} /> · {quote.when}
              </span>
            </>
          )}
        </div>
      </div>
      <span className="flex-1" />
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
