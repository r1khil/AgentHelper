import { cn } from "@/lib/utils";
import { PageHead } from "@/components/app/page-head";
import { RowLink } from "@/components/app/row-link";
import type { ListStatus } from "./timeline";

export type SavedCallRow = { id: string; href: string; ticker: string; title: string; when: string; status: ListStatus; /** Who recorded it, how long it ran and which team, for a tooltip. */ detail: string };

/**
 * Research › Sell-side calls: the page header (with the section's tabs and "Record a call"), the saved calls on the
 * left, and the selected call beside them (its own middle column and timeline, or a note when none is selected).
 * At desktop widths the screen is exactly the window, so the list and the call scroll inside their columns.
 */
export function SellSideLayout({
  scopeSlug,
  record,
  calls,
  selectedId,
  heading,
  empty,
  children,
}: {
  scopeSlug: string;
  /** The "Record a call" button and its form. */
  record: React.ReactNode;
  calls: SavedCallRow[];
  selectedId: string | null;
  /** Saved calls header, e.g. "Whole fund · 18 calls". */
  heading: React.ReactNode;
  empty: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div data-full-bleed className="flex h-dvh min-h-0 flex-col">
      <PageHead crumbs={[{ label: "Research", href: `/t/${scopeSlug}/agent` }, { label: "Sell-side calls" }]} actions={record} />
      <div className="flex min-h-0 flex-1">
        <aside aria-label="Saved calls" className="w-[260px] shrink-0 overflow-y-auto border-r pt-[18px] pr-4 pb-10 pl-10">
          <h2 className="pb-1 text-caption font-semibold text-muted-foreground">{heading}</h2>
          {calls.length ? (
            <nav aria-label="Saved calls">
              <ul>
                {calls.map((c) => {
                  const selected = c.id === selectedId;
                  return (
                    <li key={c.id}>
                      <RowLink
                        href={c.href}
                        aria-current={selected ? "page" : undefined}
                        title={c.detail}
                        className={cn(
                          "-mx-2 flex flex-col rounded-lg border-b border-row px-2 py-[9px] transition-colors outline-none hover:bg-band focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                          selected && "bg-secondary hover:bg-secondary",
                        )}
                      >
                        <span className={cn("truncate text-body", selected ? "font-semibold" : "font-normal")}>
                          {c.ticker} · {c.title}
                        </span>
                        <span className="truncate text-caption text-muted-foreground">
                          {c.when} · <span className={cn(c.status.tone === "caution" && "text-caution-foreground")}>{c.status.label}</span>
                        </span>
                      </RowLink>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : (
            <p className="pt-2 text-body text-muted-foreground">{empty}</p>
          )}
        </aside>
        {children}
      </div>
    </div>
  );
}

/** The middle column when no call is selected. */
export function PickACall({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col px-8 pt-6">
      <h2 className="text-display font-bold tracking-[-0.02em]">Pick a call</h2>
      <p className="mt-1 max-w-md text-body text-muted-foreground">{children}</p>
    </div>
  );
}
