import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { itemTeam, loadScope } from "@/lib/teams";
import { getHolding, listNotes, listPendingProposals, listTeamMembers, loadHoldingActivity } from "@/lib/holdings";
import { marketSnapshot } from "@/lib/market";
import { getBarsRange, SPX_SYMBOL } from "@/lib/providers/yahoo";
import { listFilings } from "@/lib/providers/edgar";
import { finnhubConfigured, getCompanyNews } from "@/lib/providers/finnhub";
import { NY, todayNY } from "@/lib/providers/calendar";
import { fmtCurrency, fmtDay, fmtNumber, fmtPct, fmtTime } from "@/lib/format";
import { canManageTeam, isFundWide } from "@/lib/auth";
import { effectiveRunStatus, listHoldingChats } from "@/lib/chats";
import { documentLabel } from "@/lib/drive/labels";
import { driveStatus, listHoldingFiles } from "@/lib/drive/index";
import { listHoldingFilings } from "@/lib/documents/index";
import { DocumentUploadForm } from "@/components/app/document-upload-form";
import { DocumentSummary } from "@/components/app/document-summary";
import { ThesisProposal } from "@/components/app/thesis-proposal";
import { PriceChart } from "@/components/app/price-chart";
import { alignPrices } from "@/lib/charts/series";
import { HoldingHeader, HoldingTabs, type HeaderQuote } from "@/components/app/holdings/holding-header";
import { HoldingActions } from "@/components/app/holdings/holding-actions";
import { ThesisPanel } from "@/components/app/holdings/thesis-panel";
import { NotesPanel, NotesTab, monthDay, type NoteItem } from "@/components/app/holdings/notes";
import { GlancePanel, LatestPanel, type GlanceRow, type LatestItem } from "@/components/app/holdings/overview-side";
import { DocumentsTab, EarningsTab, ResearchTab, type EarningsRow } from "@/components/app/holdings/tab-panels";
import { expectationsDue, shortDate } from "@/components/app/holdings/attention";

const MATERIAL_FORMS = ["10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A", "20-F", "6-K", "DEF 14A", "S-1", "424B4"];
const TABS = ["overview", "research", "documents", "earnings", "notes"] as const;
type Tab = (typeof TABS)[number];
const DAY = 86_400_000;

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  return { title: ticker.toUpperCase() };
}

export default async function HoldingPage({ params, searchParams }: { params: Promise<{ team: string; ticker: string }>; searchParams: Promise<{ error?: string; tab?: string }> }) {
  const { team: slug, ticker } = await params;
  const { error: flash, tab: tabParam } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";
  // The fund scope shows any team's holding; a team scope only its own.
  const scope = await loadScope(slug);
  const { user } = scope;
  const row = await getHolding(scope.teamIds, ticker);
  if (!row) notFound();
  const { h } = row;
  const team = itemTeam(scope, h.teamId);

  // Network sources load only on the tabs that show them: price history on Overview, EDGAR and news on Overview and Documents.
  const wantsChart = tab === "overview";
  const wantsFeeds = tab === "overview" || tab === "documents";
  const { since, today: newsToday } = newsWindow();
  const none = Promise.resolve([] as never[]);
  const [members, notes, market, bars, spxBars, filings, news, drive, docs, proposals, indexedFilings, activity, chats] = await Promise.all([
    listTeamMembers(team.id),
    listNotes(h.id),
    marketSnapshot([h.ticker]),
    wantsChart ? getBarsRange(h.ticker, historyStart()).then((r) => r.bars).catch(() => []) : none,
    wantsChart ? getBarsRange(SPX_SYMBOL, historyStart()).then((r) => r.bars).catch(() => []) : none,
    wantsFeeds && h.cik ? listFilings(h.cik, { forms: MATERIAL_FORMS, limit: 8 }).catch(() => []) : none,
    wantsFeeds && finnhubConfigured() ? getCompanyNews(h.ticker, since, newsToday).catch(() => []) : none,
    driveStatus().catch(() => null),
    listHoldingFiles(h.id, 30).catch(() => []),
    listPendingProposals(h.id).catch(() => []),
    listHoldingFilings(h.id, 8).catch(() => []),
    loadHoldingActivity(h.id),
    listHoldingChats(h.id, { fundWide: isFundWide(user) }).catch(() => []),
  ]);

  const today = todayNY();
  const now = nowMs();
  // Links stay in the scope the holding was opened in.
  const base = `/t/${scope.slug}`;
  const holdingPath = `${base}/h/${encodeURIComponent(h.ticker)}`;
  const boardHref = `${base}/agent/h/${encodeURIComponent(h.ticker)}`;
  const manage = canManageTeam(user, team.id);
  const thesisProposal = !h.thesis?.trim() ? proposals.find((p) => p.field === "thesis") : undefined;
  const driveReady = Boolean(drive?.connected && drive.rootFolderId && !drive.needsReconnect);
  const driveNote = !drive?.configured ? "Google Drive is not set up on this deployment." : !drive.connected || !drive.rootFolderId ? "Ask an admin to connect Google Drive from the Admin page." : drive.needsReconnect ? "Google Drive needs to be reconnected by an admin." : undefined;
  const active = h.status === "active";

  // ── Header ──
  const m = market.rows[h.ticker];
  const quote: HeaderQuote = m?.quote
    ? { price: m.quote.price, currency: m.quote.currency, changePct: m.quote.changePct, relativePp: m.relativePp, when: quoteWhen(m.quote.asOf, m.quote.marketState, today) }
    : { error: market.error ?? m?.error ?? "Quote unavailable" };
  // The holding belongs to the whole team; its movement and prep-pack email goes to the leads (see teamRecipients).
  const leadNames = members.filter((mm) => mm.role === "lead_analyst").map((mm) => mm.fullName);

  // ── Earnings ──
  const upcoming = activity.reports.filter((e) => e.status === "upcoming" && e.reportDate >= today).sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  const next = upcoming[0];
  const earningsRows: EarningsRow[] = activity.reports.map((e) => ({
    id: e.id,
    href: `${base}/earnings/${e.id}`,
    date: e.reportDate,
    when: [hourLabel(e.reportHour), e.dateStatus === "estimated" ? "estimated" : "confirmed"].filter(Boolean).join(" · "),
    period: e.fiscalPeriod,
    status: e.status,
    expectations: e.preLockedAt ? "locked" : e.expectations?.trim() ? "draft" : "none",
    eps: e.epsEstimate != null ? fmtCurrency(e.epsEstimate, e.epsCurrency) : null,
  }));

  // ── Tabs ──
  const docCount = docs.length + indexedFilings.length + activity.models.length;
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "research", label: "Research", count: chats.length || undefined },
    { key: "documents", label: "Documents & filings", count: docCount || undefined },
    { key: "earnings", label: "Earnings", count: next ? shortDate(next.reportDate) : undefined },
    { key: "notes", label: "Notes", count: notes.length || undefined },
  ].map((t) => ({ ...t, href: t.key === "overview" ? holdingPath : `${holdingPath}?tab=${t.key}`, active: t.key === tab }));

  const noteItems: NoteItem[] = notes.map(({ n, authorName }) => ({ id: n.id, body: n.body, authorName, createdAt: n.createdAt, canDelete: n.authorId === user.id || manage }));
  const menuLinks = [
    { label: `${h.ticker} research`, href: boardHref },
    { label: "Earnings", href: `${holdingPath}?tab=earnings` },
    { label: "Documents & filings", href: `${holdingPath}?tab=documents` },
    { label: "Movements", href: `${base}/movements` },
    ...(h.cik ? [{ label: "Open on SEC EDGAR", href: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${h.cik}`, external: true }] : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 md:-mt-1">
      <HoldingHeader
        team={team.name}
        ticker={h.ticker}
        company={h.companyName}
        exited={!active}
        quote={quote}
        actions={<HoldingActions ticker={h.ticker} holdingId={h.id} boardHref={boardHref} canUpload={active} uploadDisabledReason={driveNote} canExit={manage && active} links={menuLinks} />}
      />
      <HoldingTabs tabs={tabs} />

      {tab === "overview" && (
        <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="flex min-h-0 min-w-0 flex-col gap-5">
            <PriceChart data={alignPrices(bars, spxBars)} ticker={h.ticker} currency={m?.quote?.currency} className="shrink-0" />
            <ThesisPanel holdingId={h.id} thesis={h.thesis} meta={h.thesisUpdatedAt ? `updated ${monthDay(h.thesisUpdatedAt)}` : undefined} flash={flash} proposal={thesisProposal ? <ThesisProposal proposal={thesisProposal} /> : undefined} />
            <NotesPanel holdingId={h.id} notes={noteItems} className="flex-1" />
          </div>
          <div className="flex min-h-0 min-w-0 flex-col gap-5">
            <GlancePanel rows={glanceRows({ h, teamName: team.name, leadNames, next, moves: activity.moves, base, now })} />
            <LatestPanel
              className="flex-1"
              items={latestItems({
                indexed: indexedFilings,
                edgar: filings,
                news,
                docs,
                models: activity.models,
                base,
                now,
              })}
            />
          </div>
        </div>
      )}

      {tab === "research" && (
        <ResearchTab
          ticker={h.ticker}
          boardHref={boardHref}
          chats={chats.map(({ c, authorName, questions }) => ({ id: c.id, title: c.title, author: authorName, questions, updatedAt: c.updatedAt, running: effectiveRunStatus(c) === "running", href: `${boardHref}?chat=${c.id}` }))}
        />
      )}

      {tab === "documents" && (
        <DocumentsTab
          docs={docs.map((d) => ({
            id: d.id,
            name: d.name,
            href: d.webViewLink ?? `https://drive.google.com/file/d/${d.id}/view`,
            label: documentLabel(d),
            path: d.path,
            modified: d.modifiedTime,
            summary: <DocumentSummary summary={d.summary} summaryModel={d.summaryModel} summarizedAt={d.summarizedAt} />,
          }))}
          docsNote={driveReady ? "Nothing filed for this holding yet. Hoot reads these documents for context." : "Hoot reads the team's initiating report, earnings updates, and model from the Fund's Drive."}
          driveCount={driveReady ? `${docs.length} in the Fund's Drive` : undefined}
          upload={active ? <DocumentUploadForm holdingId={h.id} disabledReason={driveNote} /> : undefined}
          models={activity.models.map((mm) => ({ ...mm, href: `${base}/models/${mm.id}` }))}
          modelsHref={`${base}/models`}
          indexed={indexedFilings.map((f) => ({ id: f.id, form: f.form ?? "filing", title: f.title, url: f.url, note: f.sectionNote, date: f.publishedAt, isNew: !!f.publishedAt && now - f.publishedAt.getTime() < 7 * DAY }))}
          indexedEmpty={h.cik ? "No filings indexed yet. The morning sweep indexes 10-K, 10-Q and 8-K filings; an admin can backfill two years from the Admin page." : "No SEC registrant matched this ticker."}
          edgar={filings.map((f) => ({ key: f.accession, form: f.form, title: f.description || f.primaryDocument, url: f.url, filedAt: f.filedAt }))}
          edgarEmpty={h.cik ? "No filings found." : "No SEC registrant matched this ticker."}
          cikLabel={h.cik ? `CIK ${Number(h.cik)}` : "No CIK"}
          news={news.slice(0, 8).map((n) => ({ id: n.id, headline: n.headline, url: n.url, source: n.source, publishedAt: n.publishedAt }))}
          newsNote={!finnhubConfigured() ? "News isn't set up yet: an admin needs to turn it on." : news.length === 0 ? "No news in the window." : undefined}
        />
      )}

      {tab === "earnings" && <EarningsTab rows={earningsRows} calendarHref={`${base}/earnings`} />}

      {tab === "notes" && <NotesTab holdingId={h.id} notes={noteItems} />}
    </div>
  );
}

type HoldingRow = NonNullable<Awaited<ReturnType<typeof getHolding>>>;
type Activity = Awaited<ReturnType<typeof loadHoldingActivity>>;

function glanceRows({ h, teamName, leadNames, next, moves, base, now }: { h: HoldingRow["h"]; teamName: string; leadNames: string[]; next: Activity["reports"][number] | undefined; moves: Activity["moves"]; base: string; now: number }): GlanceRow[] {
  const shares = h.shares != null ? `${fmtNumber(h.shares, 2)} sh` : null;
  const weight = h.weightPct != null ? `${fmtPct(h.weightPct, 1)} of NAV` : null;
  const open = moves.filter((mv) => mv.status !== "completed");
  const overdue = open.find((mv) => mv.dueAt && mv.dueAt.getTime() < now);
  const last = moves[0];
  const expectations = next ? (next.preLockedAt ? "Locked in" : next.expectations?.trim() ? "Draft" : "Not started") : null;
  const link = "text-[12.5px] font-semibold hover:underline";
  return [
    {
      label: "Team",
      value: teamName,
      title: leadNames.length ? `The whole team covers it. Movement alerts go to its ${leadNames.length > 1 ? "leads" : "lead"}, ${leadNames.join(", ")}.` : "The whole team covers it. It has no lead analyst yet, so movement alerts go to everyone on it.",
    },
    { label: "Position", value: shares || weight ? [shares, weight].filter(Boolean).join(" · ") : <span className="text-muted-foreground">Not recorded</span> },
    {
      label: "Next report",
      value: next ? `${shortDate(next.reportDate)}${hourLabel(next.reportHour) ? `, ${hourLabel(next.reportHour)}` : ""}${next.dateStatus === "estimated" ? " (est.)" : ""}` : <span className="text-muted-foreground">None scheduled</span>,
    },
    {
      label: "Expectations",
      value: expectations ?? <span className="text-muted-foreground">—</span>,
      title: next && !next.preLockedAt ? `Due ${shortDate(expectationsDue(next.reportDate, next.reportHour))}` : undefined,
      action: next ? (
        <Link href={`${base}/earnings/${next.id}`} className={next.preLockedAt ? `${link} text-muted-foreground` : expectations === "Not started" ? `${link} text-hoot-foreground` : link}>
          {next.preLockedAt ? "Open" : expectations === "Not started" ? "Write now" : "Finish"}
        </Link>
      ) : undefined,
    },
    {
      label: "Movements",
      value: open.length
        ? `${open.length} open${overdue ? " · write-up overdue" : open[0].dueAt ? ` · due ${fmtDay(open[0].dueAt)}` : ""}`
        : last
          ? `None open · last ${shortDate(last.sessionDate)}`
          : "None yet",
      action: open.length ? (
        <Link href={`${base}/movements/${open[0].id}`} className={overdue ? `${link} text-hoot-foreground` : link}>
          Open
        </Link>
      ) : undefined,
    },
  ];
}

function latestItems({
  indexed,
  edgar,
  news,
  docs,
  models,
  base,
  now,
}: {
  indexed: Awaited<ReturnType<typeof listHoldingFilings>>;
  edgar: Awaited<ReturnType<typeof listFilings>>;
  news: Awaited<ReturnType<typeof getCompanyNews>>;
  docs: Awaited<ReturnType<typeof listHoldingFiles>>;
  models: Activity["models"];
  base: string;
  now: number;
}): LatestItem[] {
  const items: LatestItem[] = [];
  const seen = new Set<string>();
  const fresh = (t: number) => now - t < 3 * DAY;
  for (const f of indexed) {
    const at = f.publishedAt?.getTime() ?? 0;
    const day = f.publishedAt?.toISOString().slice(0, 10);
    seen.add(`${f.form}|${day}`);
    items.push({ kind: f.form ?? "SEC", title: f.title, meta: ["SEC", f.publishedAt ? monthDay(f.publishedAt) : null, fresh(at) ? "new" : null, "indexed for Hoot"].filter(Boolean).join(" · "), href: f.url ?? undefined, external: true, hot: fresh(at), at });
  }
  for (const f of edgar) {
    if (seen.has(`${f.form}|${f.filedAt}`)) continue;
    const at = Date.parse(`${f.filedAt}T12:00:00Z`);
    items.push({ kind: f.form, title: f.description || f.primaryDocument, meta: ["SEC", shortDate(f.filedAt), fresh(at) ? "new" : null].filter(Boolean).join(" · "), href: f.url, external: true, hot: fresh(at), at });
  }
  for (const n of news) {
    const at = Date.parse(n.publishedAt);
    items.push({ kind: "NEWS", title: n.headline, meta: `${n.source} · ${monthDay(new Date(at))}`, href: n.url, external: true, at });
  }
  for (const d of docs) {
    const at = d.modifiedTime?.getTime() ?? d.createdAt.getTime();
    const s = d.summary;
    const extra = [s?.rating ? `rating ${s.rating}` : null, s?.priceTarget ? `PT ${s.priceTarget}` : null].filter(Boolean).join(", ");
    items.push({
      kind: d.kind === "model" ? "MODEL" : "DRIVE",
      title: d.name,
      meta: [documentLabel(d), monthDay(new Date(at)), extra || null].filter(Boolean).join(" · "),
      href: d.webViewLink ?? `https://drive.google.com/file/d/${d.id}/view`,
      external: true,
      at,
    });
  }
  for (const mm of models) {
    const at = mm.createdAt.getTime();
    items.push({ kind: "MODEL", title: mm.fileName, meta: [`v${mm.version}`, monthDay(mm.createdAt), mm.pending ? `${mm.pending} values to review` : null].filter(Boolean).join(" · "), href: `${base}/models/${mm.id}`, at });
  }
  return items.sort((a, b) => b.at - a.at).slice(0, 7);
}

function hourLabel(hour: string | null) {
  return hour === "bmo" ? "before open" : hour === "amc" ? "after close" : hour === "dmh" ? "during market hours" : "";
}

/** "Friday close" once the session is over, "today" or the time while it trades. */
function quoteWhen(asOf: string, marketState: string | undefined, today: string) {
  const t = DateTime.fromISO(asOf).setZone(NY);
  if (!t.isValid) return "latest";
  if (marketState === "REGULAR") return `as of ${fmtTime(asOf)}`;
  return t.toISODate() === today ? "today's close" : `${t.toFormat("cccc")} close`;
}

function newsWindow() {
  const now = nowMs();
  return { since: new Date(now - 7 * DAY).toISOString().slice(0, 10), today: new Date(now).toISOString().slice(0, 10) };
}

/** A full year plus a calendar cushion for the starting trading session. */
function historyStart() {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  date.setUTCDate(date.getUTCDate() - 10);
  return date.toISOString().slice(0, 10);
}

/** Read once per request; a helper so the render stays free of impure calls. */
function nowMs() {
  return Date.now();
}
