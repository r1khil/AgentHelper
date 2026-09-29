"use client";

import { usePathname } from "next/navigation";
import { Segmented } from "@/components/app/panel";
import { portfolioViewFor, type PortfolioView } from "@/lib/nav";

/**
 * The Portfolio's frame, shared by its six views (the route group's layout): the header, the book's value, chart and
 * five numbers, then the control that switches views, and the view. Positions has the rail beside it (ask Hoot, what
 * is moving the book, the last session); the other views take the full width. The layout doesn't re-render between
 * views, so the hero and its chart stay put while only the view below changes. With the classic Backtesting layout
 * (a member's preference) What if keeps its own chrome.
 */
export function PortfolioFrame({
  head,
  hero,
  views,
  rail,
  classicWhatIf,
  children,
}: {
  head: React.ReactNode;
  hero: React.ReactNode;
  views: { key: PortfolioView; label: string; href: string }[];
  rail?: React.ReactNode;
  classicWhatIf?: boolean;
  children: React.ReactNode;
}) {
  const view = portfolioViewFor(usePathname()) ?? "positions";
  if (classicWhatIf && view === "what-if") return <>{children}</>;
  const withRail = view === "positions" && !!rail;
  return (
    <>
      {head}
      <div className="flex items-start gap-9">
        <div className="flex min-w-0 flex-1 flex-col">
          {hero}
          {views.length > 1 && (
            <Segmented
              label="Portfolio views"
              className="mt-[22px] self-start rounded-[10px] bg-surface p-[3px]"
              segments={views.map((v) => ({ key: v.key, label: v.label, href: v.href, active: v.key === view }))}
            />
          )}
          <div className="mt-3.5 flex min-w-0 flex-col">{children}</div>
        </div>
        {withRail && (
          <aside aria-label="About the portfolio" className="flex w-[300px] shrink-0 flex-col gap-[18px]">
            {rail}
          </aside>
        )}
      </div>
    </>
  );
}
