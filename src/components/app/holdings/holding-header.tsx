import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";
import { Move } from "@/components/app/move";
import { CountChip, Pill } from "@/components/app/panel";

export type HeaderQuote = { price: number; currency?: string; changePct?: number; relativePp?: number; when: string } | { error: string };

/** Breadcrumb, then the ticker, company, price and moves inline, with the page's actions on the right. */
export function HoldingHeader({
  crumbs,
  ticker,
  company,
  exited,
  quote,
  actions,
}: {
  crumbs: { label: string; href?: string }[];
  ticker: string;
  company: string;
  exited?: boolean;
  quote: HeaderQuote;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-end gap-3">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[12.5px] text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3" />}
              {c.href ? (
                <Link href={c.href} className="hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                c.label
              )}
            </span>
          ))}
        </nav>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-mono text-[28px] leading-tight font-semibold tracking-[-0.02em]">{ticker}</h1>
          <span className="text-base whitespace-nowrap text-ink-2">{company}</span>
          {exited && <Pill className="self-center">Exited</Pill>}
          {"error" in quote ? (
            <span className="text-[13px] text-muted-foreground">{quote.error}</span>
          ) : (
            <>
              <span className="ml-2 font-mono text-lg font-medium tabular-nums" title={quote.currency && quote.currency !== "USD" ? quote.currency : undefined}>
                {quote.currency && quote.currency !== "USD" ? "" : "$"}
                {fmtMoney(quote.price)}
                {quote.currency && quote.currency !== "USD" ? ` ${quote.currency}` : ""}
              </span>
              <Move value={quote.changePct} unit="%" digits={2} className="text-sm" />
              <span className="text-[13px] whitespace-nowrap text-muted-foreground">
                vs S&amp;P <Move value={quote.relativePp} unit=" pp" digits={1} /> · {quote.when}
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

export type HoldingTab = { key: string; label: string; count?: React.ReactNode; href: string; active: boolean };

/** Underlined in-page tabs (links, `?tab=`): 14px, the active one 600 with a 2px ink underline. */
export function HoldingTabs({ tabs }: { tabs: HoldingTab[] }) {
  return (
    <nav aria-label="Holding sections" className="flex shrink-0 gap-[22px] overflow-x-auto border-b">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 pb-2.5 text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            t.active ? "font-semibold text-foreground shadow-[inset_0_-2px_0_var(--foreground)]" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
          {t.count !== undefined && t.count !== null && t.count !== "" && <CountChip className="font-normal">{t.count}</CountChip>}
        </Link>
      ))}
    </nav>
  );
}
