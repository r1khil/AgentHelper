import { fmtDate } from "@/lib/format";
import { HoldingLogo } from "@/components/app/holding-logo";
import { RowLink } from "@/components/app/row-link";
import type { loadWatchlist, ScreenerScope } from "@/app/(app)/screener/load";
import type { ScreenerQuery } from "@/app/(app)/screener/types";
import { companyHref, Lede, ScreenerFrame, StatusWord } from "./parts";
import { AddWatch, RemoveWatch } from "./watchlist-controls";

type Data = Awaited<ReturnType<typeof loadWatchlist>>;

const COLS = "grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_120px_84px] items-center gap-3";

/** Watchlist: names a team follows without owning. The filing-change detector reads their filings as it does holdings'. */
export function WatchlistTab({ q, scope, data }: { q: ScreenerQuery; scope: ScreenerScope; data: Data }) {
  const teamName = new Map(scope.teams.map((t) => [t.id, t.name]));
  const manageable = new Set(scope.manageable.map((t) => t.id));
  return (
    <ScreenerFrame q={q} scope={scope}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Lede>Names a team follows without owning. Their 10-K, 10-Q and 8-K filings are checked for changes each evening, like the holdings&apos;.</Lede>
        {scope.manageable.length > 0 && <AddWatch teams={scope.manageable.map((t) => ({ id: t.id, name: t.name }))} defaultTeamId={scope.team?.id ?? null} />}
      </div>
      <div role="table" aria-label="Watchlist" className="mt-5 text-body">
        <div role="row" className={`${COLS} h-10 border-b text-caption text-muted-foreground`}>
          <span role="columnheader">Company</span>
          <span role="columnheader">Team</span>
          <span role="columnheader">Added</span>
          <span role="columnheader">Filing changes</span>
          <span role="columnheader" className="sr-only">
            Remove
          </span>
        </div>
        {data.rows.length === 0 && (
          <div role="row" className="border-b py-4 text-muted-foreground">
            <span role="cell">Nothing on the watchlist yet. Add a ticker a team is following, or one from Worth a look.</span>
          </div>
        )}
        {data.rows.map((w) => {
          const open = data.open.get(w.ticker) ?? 0;
          return (
            <div key={w.id} role="row" className={`${COLS} relative min-h-10 border-b border-row py-1 transition-colors hover:bg-band`}>
              <span role="rowheader" className="flex min-w-0 items-center gap-2.5">
                <HoldingLogo ticker={w.ticker} size={20} />
                <RowLink cover="stretch" href={companyHref(w.ticker)} className="flex min-w-0 items-baseline gap-2">
                  <span className="font-semibold">{w.ticker}</span>
                  <span className="truncate text-caption text-muted-foreground">{w.companyName}</span>
                </RowLink>
              </span>
              <span role="cell" className="truncate text-ink-2">
                {teamName.get(w.teamId) ?? "—"}
              </span>
              <span role="cell" className="truncate text-ink-2">
                {fmtDate(w.createdAt)}
                {w.addedByName && <span className="text-muted-foreground">, {w.addedByName}</span>}
              </span>
              <span role="cell">
                {!w.cik ? (
                  <StatusWord tone="caution" title="No SEC filings to read: not an SEC registrant">
                    Not an SEC filer
                  </StatusWord>
                ) : open ? (
                  <StatusWord tone="ink">{open} to mark</StatusWord>
                ) : (
                  <StatusWord>None open</StatusWord>
                )}
              </span>
              <span role="cell" className="text-right">
                {manageable.has(w.teamId) && <RemoveWatch id={w.id} ticker={w.ticker} />}
              </span>
            </div>
          );
        })}
      </div>
    </ScreenerFrame>
  );
}
