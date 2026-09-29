import Link from "next/link";
import { DateTime } from "luxon";
import { refreshChangelog } from "@/lib/actions/changelog";
import { EmptyState } from "@/components/app/empty-state";
import { PageHead, PageHero } from "@/components/app/page-head";
import { Pill } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { EntryMenu } from "./entry-menu";
import { fmtDate, fmtDay } from "@/lib/format";

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
  /** GitHub sync status (streams in; see page.tsx). */
  status: React.ReactNode;
  /** "Now" in ISO, for the counts. */
  now: string;
};

const day = (iso: string) => DateTime.fromISO(iso, { zone: NY });

/** Every merged change, newest first and grouped by the day it merged. */
export function ChangelogView({ entries, isAdmin, status, now }: ChangelogViewProps) {
  const today = day(now);
  const lastWeek = entries.filter((e) => day(e.mergedAt) > today.minus({ days: 7 })).length;
  const thisMonth = entries.filter((e) => day(e.mergedAt).hasSame(today, "month")).length;

  const groups: { key: string; at: string; rows: ChangelogRow[] }[] = [];
  for (const e of entries) {
    const key = day(e.mergedAt).toISODate()!;
    const last = groups.at(-1);
    if (last?.key === key) last.rows.push(e);
    else groups.push({ key, at: e.mergedAt, rows: [e] });
  }

  return (
    <>
      <PageHead
        crumbs={[{ label: "Manage" }, { label: "Changelog" }]}
        asof="Execs and admins · every change merged into the app, newest first"
        tabs={false}
        actions={
          <form action={refreshChangelog}>
            <Button type="submit" variant="secondary">
              Refresh
            </Button>
          </form>
        }
      />
      <div className="flex max-w-[900px] flex-col">
        <PageHero
          label="Merged in the last 7 days"
          value={`${lastWeek} ${lastWeek === 1 ? "change" : "changes"}`}
          note={
            <>
              {thisMonth} {thisMonth === 1 ? "change" : "changes"} this month · summaries are written once by the model chosen in{" "}
              <Link href="/admin?tab=jobs#agent" className="underline decoration-border underline-offset-[3px] hover:decoration-foreground">
                Admin
              </Link>
            </>
          }
        />
        <span className="mt-1 text-caption text-muted-foreground">
          {status} · GitHub is checked every 15 minutes{isAdmin ? " · admins can rewrite a summary that came out wrong from the menu on its row" : ""}
        </span>

        {entries.length === 0 ? (
          <EmptyState title="No changes recorded yet" hoot="sleepy" className="mt-8 w-full max-w-lg">
            Merged changes will appear here automatically.
          </EmptyState>
        ) : (
          groups.map((g) => (
            <section key={g.key} aria-label={fmtDay(g.at)}>
              <h2 className="border-b pt-[22px] pb-1.5 text-caption font-semibold text-muted-foreground">{fmtDay(g.at)}</h2>
              <ol>
                {g.rows.map((e) => (
                  <li key={e.prNumber} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-b border-row py-3">
                    <article className="flex min-w-0 flex-col gap-[3px]">
                      <div className="flex items-center gap-2">
                        <h3 className="text-emph font-semibold">{e.headline}</h3>
                        {e.fallback && isAdmin && (
                          <Pill tone="caution" title="The summary model was unavailable; the pull request's title stands in until a retry">
                            Summary not generated
                          </Pill>
                        )}
                      </div>
                      <p className="text-body text-ink-3">{e.summary}</p>
                      <span className="text-caption text-muted-foreground" title={`Merged ${fmtDate(e.mergedAt)}`}>
                        {e.author}
                      </span>
                    </article>
                    <div className="flex items-center gap-1.5 justify-self-end">
                      {isAdmin ? (
                        <a href={e.url} target="_blank" rel="noreferrer" className="text-body font-semibold hover:underline">
                          #{e.prNumber}
                        </a>
                      ) : (
                        <span className="text-body font-semibold">#{e.prNumber}</span>
                      )}
                      {isAdmin && <EntryMenu prNumber={e.prNumber} headline={e.headline} />}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))
        )}
      </div>
    </>
  );
}
