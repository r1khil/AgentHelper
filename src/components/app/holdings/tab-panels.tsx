import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate, relativeTime } from "@/lib/format";
import { PanelHeader, Pill } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { ReadAs } from "@/components/app/read-as";
import { RowLink } from "@/components/app/row-link";

const ROW = "flex items-center gap-3 border-b border-row px-4 last:border-b-0";

function Tag({ children, hot }: { children: React.ReactNode; hot?: boolean }) {
  // A kind is a word, not a badge: grey, and ink for something filed in the last few days.
  return <span className={cn("w-[50px] shrink-0 text-caption font-semibold", hot ? "text-foreground" : "text-muted-foreground")}>{children}</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-body text-muted-foreground">{children}</p>;
}

// ── Research ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type ResearchChat = { id: string; title: string; author: string | null; questions: number; updatedAt: Date; running: boolean; href: string };

/** Every chat with Hoot pinned to this holding (its research), newest first. */
export function ResearchTab({ ticker, chats, boardHref }: { ticker: string; chats: ResearchChat[]; boardHref: string }) {
  return (
    <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <PanelHeader
        title="Chats"
        count={chats.length}
        aside={
          <Button size="sm" nativeButton={false} render={<Link href={boardHref} />}>
            <MessageSquareText />
            Ask Hoot about {ticker}
          </Button>
        }
      />
      {chats.length === 0 ? (
        <Empty>No questions about {ticker} yet. Chats started from {ticker} research, a movement or an earnings prep pack show up here.</Empty>
      ) : (
        <ul className="min-h-0 flex-1">
          {chats.map((c) => (
            <li key={c.id} className="border-b border-row last:border-b-0">
              <RowLink href={c.href} className="flex h-[52px] items-center gap-3 px-4 transition-colors hover:bg-band">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium">{c.title}</span>
                  <span className="block truncate text-caption text-muted-foreground">
                    {c.author ?? "Someone"} · {c.questions} question{c.questions === 1 ? "" : "s"}
                  </span>
                </span>
                {c.running && <Pill tone="caution">Answering…</Pill>}
                <span className="shrink-0 font-mono text-body text-muted-foreground">{relativeTime(c.updatedAt)}</span>
              </RowLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Documents & filings ───────────────────────────────────────────────────────────────────────────────────────────

export type DocRow = { id: string; name: string; href: string; label: string; path: string; modified: Date | null; summary: React.ReactNode };
export type IndexedFiling = { id: string; form: string; title: string; url: string | null; note: string | null; date: Date | null; isNew: boolean };
export type EdgarFiling = { key: string; form: string; title: string; url: string; filedAt: string };
export type NewsRow = { id: string; headline: string; url: string; source: string; publishedAt: string };
export type ModelRow = { id: string; version: number; fileName: string; createdAt: Date; uploader: string | null; pending: number; href: string };

export function DocumentsTab({
  docs,
  docsNote,
  driveCount,
  upload,
  models,
  modelsHref,
  indexed,
  indexedEmpty,
  edgar,
  edgarEmpty,
  cikLabel,
  news,
  newsNote,
}: {
  docs: DocRow[];
  /** Shown when there are no documents: why, or what goes here. */
  docsNote: string;
  driveCount?: string;
  upload?: React.ReactNode;
  models: ModelRow[];
  modelsHref: string;
  indexed: IndexedFiling[];
  indexedEmpty: string;
  edgar: EdgarFiling[];
  edgarEmpty: string;
  cikLabel: string;
  news: NewsRow[];
  /** Set when news can't load (no Finnhub key) or there is none in the window. */
  newsNote?: string;
}) {
  return (
    <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-h-0 min-w-0 flex-col gap-5">
        <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <PanelHeader title="Team documents" count={docs.length} aside={driveCount} />
          {docs.length === 0 ? (
            <Empty>{docsNote}</Empty>
          ) : (
            <ul className="min-h-0 flex-1">
              {docs.map((d) => (
                <li key={d.id} className="border-b border-row px-4 py-2.5 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <Pill className="w-36 justify-center">{d.label}</Pill>
                    <a href={d.href} target="_blank" rel="noreferrer" title={d.path} className="min-w-0 flex-1 truncate text-body hover:underline">
                      {d.name}
                    </a>
                    <span className="shrink-0 font-mono text-body text-muted-foreground">{d.modified ? relativeTime(d.modified) : ""}</span>
                  </div>
                  {d.summary && <div className="pl-[156px]">{d.summary}</div>}
                </li>
              ))}
            </ul>
          )}
          {upload && <div className="shrink-0 border-t bg-band-2 px-4 py-3">{upload}</div>}
        </section>

        <section className="panel shrink-0 overflow-hidden">
          <PanelHeader
            title="Models"
            count={models.length || undefined}
            aside={
              <Link href={modelsHref} className="hover:text-foreground">
                All models →
              </Link>
            }
          />
          {models.length === 0 ? (
            <Empty>No model uploaded for this holding. Upload an .xlsx on the Models tab and the app proposes values from each new filing.</Empty>
          ) : (
            <ul>
              {models.map((m) => (
                <li key={m.id} className="border-b border-row last:border-b-0">
                  <RowLink href={m.href} className="flex h-11 items-center gap-3 px-4 transition-colors hover:bg-band">
                    <Tag>v{m.version}</Tag>
                    <span className="min-w-0 flex-1 truncate text-body">{m.fileName}</span>
                    {m.pending > 0 && <Pill>{m.pending} to review</Pill>}
                    <span className="shrink-0 text-body text-muted-foreground">
                      {m.uploader ? `${m.uploader} · ` : ""}
                      <span className="font-mono">{fmtDate(m.createdAt)}</span>
                    </span>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="flex min-h-0 min-w-0 flex-col gap-5">
        <section className="panel shrink-0 overflow-hidden">
          <PanelHeader title="SEC filings" count={indexed.length || undefined} aside={indexed.length ? "indexed for Hoot" : undefined} />
          {indexed.length === 0 ? (
            <Empty>{indexedEmpty}</Empty>
          ) : (
            <ul>
              {indexed.map((f) => (
                <li key={f.id} className={cn(ROW, "h-11")}>
                  <Tag hot={f.isNew}>{f.form}</Tag>
                  <a href={f.url ?? "#"} target="_blank" rel="noreferrer" title={f.note ?? undefined} className="min-w-0 flex-1 truncate text-body hover:underline">
                    {f.title}
                  </a>
                  <span className="shrink-0 font-mono text-body text-muted-foreground">{f.date ? fmtDate(f.date) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel shrink-0 overflow-hidden">
          <PanelHeader title="Recent filings" aside={<span className="font-mono">{cikLabel}</span>} />
          {edgar.length === 0 ? (
            <Empty>{edgarEmpty}</Empty>
          ) : (
            <ul>
              {edgar.map((f) => (
                <li key={f.key} className={cn(ROW, "h-11")}>
                  <Tag>{f.form}</Tag>
                  <a href={f.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-body hover:underline">
                    {f.title}
                  </a>
                  <span className="shrink-0 font-mono text-body text-muted-foreground">{fmtDate(f.filedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
          <PanelHeader title="News" aside="Last 7 days" />
          {newsNote ? (
            <Empty>{newsNote}</Empty>
          ) : (
            <ul className="min-h-0 flex-1">
              {news.map((n) => (
                <li key={n.id} className="border-b border-row px-4 py-2.5 last:border-b-0">
                  <a href={n.url} target="_blank" rel="noreferrer" className="text-body leading-snug hover:underline">
                    {n.headline}
                  </a>
                  <div className="text-body text-muted-foreground">
                    {n.source} · {relativeTime(n.publishedAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

// ── Earnings ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type EarningsRow = {
  id: string;
  href: string;
  date: string;
  /** "after close (est.)" */
  when: string;
  period: string | null;
  status: "upcoming" | "reported" | "reviewed";
  expectations: "locked" | "draft" | "none";
  eps: string | null;
};

const STATUS: Record<EarningsRow["status"], string> = { upcoming: "Upcoming", reported: "Reported", reviewed: "Reviewed" };

/** Every report on file for the holding, newest first, each opening its expectations → actuals → reflection page. */
export function EarningsTab({ rows, calendarHref }: { rows: EarningsRow[]; calendarHref: string }) {
  return (
    <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <PanelHeader
        title="Earnings"
        count={rows.length || undefined}
        aside={
          <Link href={calendarHref} className="hover:text-foreground">
            Calendar →
          </Link>
        }
      />
      {rows.length === 0 ? (
        <Empty>No reports on file yet. The morning sweep adds the next report date once a provider has it.</Empty>
      ) : (
        <div role="table" aria-label="Earnings" className="min-h-0 flex-1">
          <div role="row" className="grid h-9 grid-cols-[120px_minmax(0,1fr)_110px_120px_150px_90px] items-center gap-3 border-b px-4 text-body text-muted-foreground">
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
            <div
              key={r.id}
              role="row"
              className="relative grid h-10 grid-cols-[120px_minmax(0,1fr)_110px_120px_150px_90px] items-center gap-3 border-b border-row px-4 text-body transition-colors last:border-b-0 hover:bg-band"
            >
              <span role="rowheader" className="font-mono text-body">
                <RowLink cover="stretch" href={r.href}>
                  {fmtDate(r.date)}
                </RowLink>
              </span>
              <span role="cell" className="truncate text-ink-2">{r.when || "—"}</span>
              <span role="cell" className="truncate font-mono text-body text-ink-2">{r.period ?? "—"}</span>
              <span role="cell" className="text-right font-mono text-body">{r.eps ?? "—"}</span>
              <span role="cell">
                {r.expectations === "locked" ? (
                  <Pill tone="good">Locked in</Pill>
                ) : r.expectations === "draft" ? (
                  <Pill tone="caution">Draft</Pill>
                ) : r.status === "upcoming" ? (
                  <Pill tone="caution">Not started</Pill>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
              <span role="cell" className="text-body text-muted-foreground">{STATUS[r.status]}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

