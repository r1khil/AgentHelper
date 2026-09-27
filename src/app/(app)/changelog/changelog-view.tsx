import { DateTime } from "luxon";
import { RefreshCw } from "lucide-react";
import { refreshChangelog, regenerateEntry } from "@/lib/actions/changelog";
import { EmptyState } from "@/components/app/empty-state";
import { Panel, Pill } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { ReplayTourLink } from "./replay-tour-link";

const NY = "America/New_York";

export type ChangelogRow = {
  prNumber: number;
  headline: string;
  summary: string;
  author: string;
  url: string;
  /** ISO timestamp. */
  mergedAt: string;
  /** The summary model call failed; the title stands in until a retry. */
  fallback: boolean;
};

export type ChangelogViewProps = {
  entries: ChangelogRow[];
  isAdmin: boolean;
  /** GitHub sync status for the header (streams in; see page.tsx). */
  status: React.ReactNode;
  /** The model that writes the summaries, as configured. */
  model: string;
  /** "Now" in ISO, for the month card. */
  now: string;
};

const day = (iso: string) => DateTime.fromISO(iso, { zone: NY });

/** S15: every merged change, newest first, and how the page is written. */
export function ChangelogView({ entries, isAdmin, status, model, now }: ChangelogViewProps) {
  const today = day(now);
  const thisMonth = entries.filter((e) => day(e.mergedAt).hasSame(today, "month")).length;
  const lastWeek = entries.filter((e) => day(e.mergedAt) > today.minus({ days: 7 })).length;
  const shortModel = model.replace(/^[^/]+\//, "").replace(/:free$/, "");

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel>
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b px-5">
          <h2 className="flex-1 truncate text-[14.5px] font-semibold">Every change merged into the app, newest first</h2>
          <span className="truncate text-[12.5px] text-muted-foreground">{status}</span>
          <form action={refreshChangelog}>
            <Button type="submit" variant="outline" className="h-[30px] px-3 text-[12.5px]">
              <RefreshCw data-icon="inline-start" className="size-[13px]" />
              Refresh
            </Button>
          </form>
        </div>
        {entries.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState title="No changes recorded yet" hoot="sleepy" className="w-full max-w-lg">
              Merged changes will appear here automatically.
            </EmptyState>
          </div>
        ) : (
          <ol className="flex flex-1 flex-col">
            {entries.map((e) => (
              <li key={e.prNumber} className="grid min-h-[76px] flex-1 grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-4 border-b border-row px-5 py-3 last:border-b-0">
                <div className="min-w-0">
                  <time dateTime={e.mergedAt} title={day(e.mergedAt).toFormat("cccc, MMMM d, yyyy")} className="block font-mono text-xs text-muted-foreground">
                    {day(e.mergedAt).toFormat("LLL d").toUpperCase()}
                  </time>
                  <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground" title={`Merged by ${e.author}`}>
                    {e.author}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[15px] font-semibold">{e.headline}</h3>
                    {e.fallback && isAdmin && (
                      <Pill tone="caution" title="The summary model was unavailable; the pull request's title stands in until a retry">
                        Summary not generated
                      </Pill>
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] leading-[1.45] text-ink-2">{e.summary}</p>
                </div>
                <div className="flex items-center gap-2.5 justify-self-end">
                  {isAdmin ? (
                    <a href={e.url} target="_blank" rel="noreferrer" className="font-mono text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                      #{e.prNumber}
                    </a>
                  ) : (
                    <span className="font-mono text-[11.5px] text-muted-foreground">#{e.prNumber}</span>
                  )}
                  {isAdmin && (
                    <form action={regenerateEntry}>
                      <input type="hidden" name="prNumber" value={e.prNumber} />
                      <button type="submit" className="rounded-full px-1 text-xs font-medium text-ink-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                        Regenerate
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <div className="flex flex-col gap-5 lg:sticky lg:top-20 lg:h-[calc(100dvh-104px)] lg:self-start">
        <section className="shrink-0 rounded-[14px] bg-rail px-[18px] py-4 text-cream">
          <div className="label-mono text-rail-foreground">{today.toFormat("MMMM")}</div>
          <div className="mt-2.5 grid grid-cols-2 gap-3.5">
            <div>
              <div className="figure text-[28px]">{thisMonth}</div>
              <div className="text-[12.5px] text-rail-foreground">{thisMonth === 1 ? "change" : "changes"} merged</div>
            </div>
            <div>
              <div className="figure text-[28px]">{lastWeek}</div>
              <div className="text-[12.5px] text-rail-foreground">in the last 7 days</div>
            </div>
          </div>
        </section>
        <Panel className="min-h-0 flex-1 gap-3 px-[18px] py-4">
          <h2 className="text-[14.5px] font-semibold">How this page is written</h2>
          <p className="text-[13.5px] leading-[1.55] text-ink-2">
            Each pull request gets a one-line headline and a short summary for readers who don&apos;t code, written once and stored. Admins can regenerate one that came out wrong.
          </p>
          <dl className="flex flex-col border-t border-row">
            {[
              ["Summaries written by", <span key="m" title={model}>{shortModel}</span>],
              ["GitHub checked", "every 15 min"],
              ["Shown to", "execs, admins"],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex h-9 items-center justify-between gap-3 border-b border-row text-[13px]">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="truncate font-mono text-xs">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex-1" />
          <ReplayTourLink />
        </Panel>
      </div>
    </div>
  );
}
