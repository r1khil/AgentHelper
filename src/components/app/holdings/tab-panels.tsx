import Link from "next/link";
import { fmtDate, relativeTime } from "@/lib/format";
import { ReadAs } from "@/components/app/read-as";
import { RowLink } from "@/components/app/row-link";

// The parts of the holding page's tabs that aren't plain FeedList rows: Drive documents with what the app extracted
// from each, and the earnings table.

export type DocRow = { id: string; name: string; href: string; label: string; path: string; modified: Date | null; summary: React.ReactNode };

/** The team's documents in the Fund's Drive, newest first, each with its extracted summary under it. */
export function DocumentsList({ docs, empty }: { docs: DocRow[]; empty: string }) {
  if (!docs.length) return <p className="py-4 text-body text-muted-foreground">{empty}</p>;
  return (
    <ul aria-label="Team documents" className="flex flex-col">
      {docs.map((d) => (
        <li key={d.id} className="border-b border-row py-2.5">
          <div className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3.5">
            <span className="truncate text-body text-muted-foreground">{d.label}</span>
            <a href={d.href} target="_blank" rel="noreferrer" title={d.path} className="min-w-0 truncate text-emph hover:underline">
              {d.name}
            </a>
            <span className="text-body text-muted-foreground">{d.modified ? relativeTime(d.modified) : ""}</span>
          </div>
          {d.summary && <div className="pl-[124px]">{d.summary}</div>}
        </li>
      ))}
    </ul>
  );
}

export type EarningsRow = {
  id: string;
  href: string;
  date: string;
  /** "after close, estimated" */
  when: string;
  period: string | null;
  status: "upcoming" | "reported" | "reviewed";
  expectations: "locked" | "draft" | "none";
  eps: string | null;
};

const STATUS: Record<EarningsRow["status"], string> = { upcoming: "Upcoming", reported: "Reported", reviewed: "Reviewed" };
const COLS = "grid-cols-[120px_minmax(0,1fr)_90px_100px_110px_90px]";

/** Every report on file for the holding, newest first, each opening its expectations, results and reflection page. */
export function EarningsTab({ rows, calendarHref }: { rows: EarningsRow[]; calendarHref: string }) {
  return (
    <section aria-labelledby="reports-h" className="mt-7 min-w-0">
      <div className="flex min-h-9 items-center gap-2 border-b pb-1.5">
        <h2 id="reports-h" className="text-emph font-semibold">
          Every report
          {rows.length > 0 && <span className="ml-1.5 text-caption font-semibold text-muted-foreground tabular-nums">{rows.length}</span>}
        </h2>
        <span className="flex-1" />
        <Link href={calendarHref} className="text-body text-muted-foreground hover:text-foreground">
          All reports in Markets
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-body text-muted-foreground">No reports on file yet. The morning sweep adds the next report date once a provider has it.</p>
      ) : (
        <div role="table" aria-label="Earnings reports">
          <div role="row" className={`grid h-9 ${COLS} items-center gap-3 border-b border-row text-body text-muted-foreground`}>
            <span role="columnheader">Report</span>
            <span role="columnheader">When</span>
            <span role="columnheader">Period</span>
            <span role="columnheader" className="text-right">
              <ReadAs text="EPS estimate">EPS est.</ReadAs>
            </span>
            <span role="columnheader">Expectations</span>
            <span role="columnheader">Status</span>
          </div>
          {rows.map((r) => (
            // A table row; the report date links and stretches over the row, so the whole row opens the report.
            <div key={r.id} role="row" className={`relative grid h-11 ${COLS} items-center gap-3 border-b border-row text-body transition-colors hover:bg-band`}>
              <span role="rowheader">
                <RowLink cover="stretch" href={r.href}>
                  {fmtDate(r.date)}
                </RowLink>
              </span>
              <span role="cell" className="truncate text-ink-2">
                {r.when || "—"}
              </span>
              <span role="cell" className="truncate text-ink-2">
                {r.period ?? "—"}
              </span>
              <span role="cell" className="text-right tabular-nums">
                {r.eps ?? "—"}
              </span>
              <span role="cell" className="font-semibold">
                {r.expectations === "locked" ? (
                  <span className="text-muted-foreground">Locked in</span>
                ) : r.expectations === "draft" ? (
                  <span className="text-caution-foreground">Draft</span>
                ) : r.status === "upcoming" ? (
                  <span className="text-caution-foreground">Not started</span>
                ) : (
                  <span className="font-normal text-muted-foreground">—</span>
                )}
              </span>
              <span role="cell" className="text-muted-foreground">
                {STATUS[r.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
