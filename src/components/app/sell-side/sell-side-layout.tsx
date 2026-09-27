import Link from "next/link";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/app/panel";
import type { ListStatus } from "./timeline";

export type SavedCallRow = { id: string; href: string; ticker: string; title: string; meta: string; status: ListStatus };

const TONE: Record<ListStatus["tone"], string> = {
  good: "text-good-foreground",
  caution: "text-caution-foreground",
  down: "text-down",
  muted: "text-muted-foreground",
};

/** Research › Sell-side calls: record and saved calls on the left, the selected call on the right. */
export function SellSideLayout({
  record,
  calls,
  selectedId,
  aside,
  empty,
  children,
}: {
  /** The "Record a call" card, or a note when no team is picked. */
  record: React.ReactNode;
  calls: SavedCallRow[];
  selectedId: string | null;
  /** Saved calls header aside, e.g. "Whole fund · 18". */
  aside: React.ReactNode;
  empty: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    // At desktop widths the screen is exactly the window (under the 56px header and 24px padding) so the list and
    // the selected call scroll inside their panels instead of stretching the page.
    <div className="grid min-h-0 flex-1 gap-6 lg:h-[calc(100dvh-104px)] lg:flex-none lg:min-h-[600px] lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-5">
        {record}
        <Panel className="min-h-60 flex-1 lg:min-h-0">
          <PanelHeader title="Saved calls" aside={aside} className="px-3.5" />
          <nav aria-label="Saved calls" className="min-h-0 flex-1 overflow-y-auto">
            {calls.length ? (
              <ul>
                {calls.map((c) => {
                  const selected = c.id === selectedId;
                  return (
                    <li key={c.id}>
                      <Link
                        href={c.href}
                        aria-current={selected ? "page" : undefined}
                        className={cn(
                          "block border-b border-row px-3.5 py-2.5 transition-colors outline-none hover:bg-band focus-visible:bg-band focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                          selected && "bg-band shadow-[inset_3px_0_0_var(--foreground)]",
                        )}
                      >
                        <span className="flex items-baseline gap-2">
                          <span className="font-mono text-[12.5px] font-semibold">{c.ticker}</span>
                          <span className="min-w-0 flex-1 truncate text-[13.5px]">{c.title}</span>
                          <span className={cn("shrink-0 text-xs font-medium", TONE[c.status.tone])}>{c.status.label}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{c.meta}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-3.5 py-4 text-[13px] text-muted-foreground">{empty}</p>
            )}
          </nav>
        </Panel>
      </div>
      <div className="flex min-h-[560px] min-w-0 flex-col lg:min-h-0">{children}</div>
    </div>
  );
}

/** The right pane when no call is selected. */
export function PickACall({ children }: { children: React.ReactNode }) {
  return (
    <Panel className="flex-1 items-center justify-center p-8 text-center">
      <p className="text-[14.5px] font-semibold">Pick a call</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{children}</p>
    </Panel>
  );
}

/** Shown in place of the record card while the whole fund is in scope: a call belongs to one team. */
export function PickATeam() {
  return (
    <div className="shrink-0 rounded-[14px] bg-rail p-3.5 text-cream">
      <h2 className="text-[14.5px] font-semibold">Record a call</h2>
      <p className="mt-1.5 text-[13px] leading-snug text-rail-label">
        Showing every team’s calls. Pick a sector team with the scope switcher in the rail to record a new one.
      </p>
    </div>
  );
}
