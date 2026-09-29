import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DateTime } from "luxon";
import { itemTeam, loadScope } from "@/lib/teams";
import { getHolding, listNotes, listPendingProposals, listTeamMembers, loadHoldingActivity } from "@/lib/holdings";
import { marketSnapshot } from "@/lib/market";
import { getBarsRange, SPX_SYMBOL } from "@/lib/providers/yahoo";
import { listFilings } from "@/lib/providers/edgar";
import { finnhubConfigured, getCompanyNews } from "@/lib/providers/finnhub";
import { NY, todayNY } from "@/lib/providers/calendar";
import { fmtChangeBp, fmtChangePct, fmtCurrency, fmtDay, fmtDayMonth, fmtNumber, fmtTime, ppToBp } from "@/lib/format";
import { canManageTeam, isFundWide } from "@/lib/auth";
import { effectiveRunStatus, listHoldingChats } from "@/lib/chats";
import { documentLabel } from "@/lib/drive/labels";
import { driveStatus, listHoldingFiles } from "@/lib/drive/index";
import { listHoldingFilings } from "@/lib/documents/index";
import { listTradeMarks, loadSecurityLine, sellSideSummary } from "@/lib/portfolio/holding";
import { DocumentUploadForm } from "@/components/app/document-upload-form";
import { DocumentSummary } from "@/components/app/document-summary";
import { ThesisProposal } from "@/components/app/thesis-proposal";
import { PageHead, PageHero } from "@/components/app/page-head";
import { PriceChart } from "@/components/app/price-chart";
import { alignPrices } from "@/lib/charts/series";
import { Pill } from "@/components/app/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { HoldingChart } from "@/components/app/portfolio/holding-chart";
import { toneOfText } from "@/components/app/portfolio/figures";
import { TradeDialog } from "@/components/app/attribution/trade-dialog";
import { HoldingActions } from "@/components/app/holdings/holding-actions";
import { FundPositionSection, KeyStatsSection } from "@/components/app/holdings/holding-sections";
import { ResearchList, type ResearchRow } from "@/components/app/holdings/holding-lists";
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
  const manage = canManageTeam(user, team.id);
  // Position sizes (the fund's shares, value and trades) are for execs, admins and the team's leads.
  const book = manage;

  // Network sources load only on the tabs that show them: price history on Overview, EDGAR and news on Overview and Documents.
  const wantsChart = tab === "overview";
  const wantsFeeds = tab === "overview" || tab === "documents";
  const { since, today: newsToday } = newsWindow();
  const none = Promise.resolve([] as never[]);
  const [members, notes, market, bars, spxBars, marks, securityLine, sellSide, filings, news, drive, docs, proposals, indexedFilings, activity, chats] = await Promise.all([
    listTeamMembers(team.id),
    listNotes(h.id),
    marketSnapshot([h.ticker]),
    wantsChart ? getBarsRange(h.ticker, historyStart(5)).then((r) => r.bars).catch(() => []) : none,
    wantsChart ? getBarsRange(SPX_SYMBOL, historyStart(1)).then((r) => r.bars).catch(() => []) : none,
    wantsChart && book ? listTradeMarks(h.ticker).catch(() => []) : none,
    wantsChart ? loadSecurityLine(h.ticker).catch(() => null) : Promise.resolve(null),
    wantsChart ? sellSideSummary(team.id, h.ticker).catch(() => ({ count: 0, latest: null })) : Promise.resolve({ count: 0, latest: null }),
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
  const thesisProposal = !h.thesis?.trim() ? proposals.find((p) => p.field === "thesis") : undefined;
  const driveReady = Boolean(drive?.connected && drive.rootFolderId && !drive.needsReconnect);
  const driveNote = !drive?.configured ? "Google Drive is not set up on this deployment." : !drive.connected || !drive.rootFolderId ? "Ask an admin to connect Google Drive from the Admin page." : drive.needsReconnect ? "Google Drive needs to be reconnected by an admin." : undefined;
  const active = h.status === "active";

  // ── Header ──
  const m = market.rows[h.ticker];
  const q = m?.quote;
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

  // The price and what it did today, as Look-Holding draws them: the name above, the price as the one big number.
  const priceText = q ? fmtCurrency(q.price, q.currency) : "—";
  const prev = q ? (q.previousClose ?? (q.changePct != null ? q.price / (1 + q.changePct / 100) : undefined)) : undefined;
  const delta = q && prev != null ? q.price - prev : null;
  const deltaPct = q?.changePct ?? (q && prev ? (q.price / prev - 1) * 100 : null);
  const deltaMoney = delta === null || !q ? null : fmtCurrency(delta, q.currency);
  const changeText = deltaMoney !== null && deltaPct !== null ? `${delta! > 0 && /[1-9]/.test(deltaMoney) ? "+" : ""}${deltaMoney} (${fmtChangePct(deltaPct)})` : null;
  const bp = ppToBp(m?.relativePp);
  const heroNote = [
    "Today",
    q ? quoteWhen(q.asOf, q.marketState, today) : (market.error ?? m?.error ?? "Quote unavailable"),
    bp != null ? `${fmtChangeBp(bp)} against the S&P 500` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const nameBlock = (
    <span className="flex flex-col">
      <span className="flex items-center gap-2 text-emph font-semibold text-foreground">
        {h.companyName}
        {!active && <Pill>Exited</Pill>}
      </span>
      <span className="text-caption">
        {[h.ticker, q?.exchange, securityLine ?? team.name].filter(Boolean).join(" · ")}
      </span>
    </span>
  );

  const crumbs = [
    { label: "Portfolio", href: isFundWide(user) ? "/t/fund" : `/t/${team.slug}` },
    { label: team.name, href: `/t/${team.slug}` },
    { label: h.ticker },
  ];

  // ── Research, one line each: where the team's own work on the holding lives ──
  const filing = indexedFilings[0]
    ? { title: `${indexedFilings[0].form ?? "Filing"}${indexedFilings[0].title ? `, ${indexedFilings[0].title}` : ""}`, when: indexedFilings[0].publishedAt ? `Filed ${fmtDayMonth(indexedFilings[0].publishedAt)}` : undefined, href: indexedFilings[0].url ?? undefined }
    : filings[0]
      ? { title: `${filings[0].form}${filings[0].description ? `, ${filings[0].description}` : ""}`, when: `Filed ${shortDate(filings[0].filedAt)}`, href: filings[0].url }
      : null;
  const lastModel = activity.models[0];
  const thesisLine = h.thesis?.trim().split(/\n/)[0].slice(0, 90);
  const researchRows: ResearchRow[] = [
    { kind: "Thesis", title: thesisLine || "Not written yet", when: h.thesisUpdatedAt ? `Team · ${monthDay(h.thesisUpdatedAt)}` : "Team", href: "#thesis" },
    filing?.href ? { kind: "Filing", title: filing.title, when: filing.when, href: filing.href, external: true } : { kind: "Filing", title: filing ? filing.title : "None indexed yet", when: filing?.when, href: `${holdingPath}?tab=documents` },
    { kind: "Sell-side", title: sellSide.count ? `${sellSide.count} ${sellSide.count === 1 ? "call" : "calls"} recorded` : "No calls recorded", when: sellSide.latest ? `Last ${fmtDayMonth(sellSide.latest)}` : undefined, href: `${base}/sell-side` },
    lastModel
      ? { kind: "Model", title: `${lastModel.fileName}${lastModel.pending ? ` · ${lastModel.pending} ${lastModel.pending === 1 ? "value" : "values"} to decide` : ""}`, when: lastModel.pending ? "To review" : `v${lastModel.version}`, href: `${base}/models/${lastModel.id}` }
      : { kind: "Model", title: "No model uploaded", href: `${base}/models` },
    { kind: "Earnings", title: next ? `${shortDate(next.reportDate)}${hourLabel(next.reportHour) ? `, ${hourLabel(next.reportHour)}` : ""}${next.dateStatus === "estimated" ? " (est.)" : ""}` : "None scheduled", when: next ? (next.preLockedAt ? "Locked in" : next.expectations?.trim() ? "Draft" : "Not started") : undefined, href: `${holdingPath}?tab=earnings` },
    { kind: "Hoot", title: `${h.ticker} research board`, when: chats.length ? `${chats.length} ${chats.length === 1 ? "chat" : "chats"}` : undefined, href: boardHref },
  ];

  return (
    <>
      <PageHead
        crumbs={crumbs}
        tabs={tabs}
        actions={
          <>
            <HoldingActions ticker={h.ticker} holdingId={h.id} boardHref={boardHref} canUpload={active} uploadDisabledReason={driveNote} canExit={manage && active} links={menuLinks} />
            {isFundWide(user) && <TradeDialog today={today} positions={h.shares != null ? [{ ticker: h.ticker, shares: Number(h.shares) }] : []} primary defaults={{ ticker: h.ticker }} />}
          </>
        }
      />
      <div className="flex min-w-0 flex-col">
        <PageHero label={nameBlock} value={priceText} change={changeText ?? undefined} tone={changeText ? toneOfText(changeText) : null} note={heroNote} className={tab === "overview" ? undefined : "mb-6"} />
        {tab === "overview" && (
          <>
            <HoldingChart ticker={h.ticker} bars={bars} marks={marks} currency={q?.currency} />

            <div className="mt-[26px] grid grid-cols-2 gap-14">
              {book ? (
                <Suspense fallback={<SectionFallback title="Fund position" rows={4} />}>
                  <FundPositionSection ticker={h.ticker} />
                </Suspense>
              ) : (
                <GlancePanel title="Coverage" rows={glanceRows({ h, teamName: team.name, leadNames, next, moves: activity.moves, base, now, showPosition: false })} />
              )}
              <Suspense fallback={<SectionFallback title="Key statistics" rows={4} />}>
                <KeyStatsSection ticker={h.ticker} currency={q?.currency} nextEarnings={next ? `${shortDate(next.reportDate)}${next.dateStatus === "estimated" ? " (est.)" : ""}` : null} asOf={q ? fmtTime(q.asOf) : null} />
              </Suspense>
            </div>

            <div className="mt-[30px] grid grid-cols-2 items-start gap-14">
              <div className="flex min-w-0 flex-col gap-6">
                <ThesisPanel holdingId={h.id} thesis={h.thesis} meta={h.thesisUpdatedAt ? `updated ${monthDay(h.thesisUpdatedAt)}` : undefined} flash={flash} proposal={thesisProposal ? <ThesisProposal proposal={thesisProposal} /> : undefined} />
                <NotesPanel holdingId={h.id} notes={noteItems} />
              </div>
              <div className="flex min-w-0 flex-col gap-6">
                <ResearchList rows={researchRows} />
                {book && <GlancePanel title="Coverage" rows={glanceRows({ h, teamName: team.name, leadNames, next, moves: activity.moves, base, now, showPosition: false })} />}
              </div>
            </div>

            <div className="mt-[30px] grid grid-cols-2 items-start gap-14">
              <LatestPanel
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
              <PriceChart data={alignPrices(bars.filter((b) => b.date >= historyStart(1)), spxBars)} ticker={h.ticker} currency={q?.currency} className="shrink-0" />
            </div>
          </>
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
    </>
  );
}

/** A key/value section's shape while it loads. */
function SectionFallback({ title, rows }: { title: string; rows: number }) {
  return (
    <section aria-hidden className="min-w-0">
      <h2 className="text-title font-bold tracking-[-0.01em]">{title}</h2>
      <div className="mt-2 grid grid-cols-2 gap-x-6">
        {Array.from({ length: rows * 2 }, (_, i) => (
          <div key={i} className="flex h-10 items-center justify-between border-b border-row">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
    </section>
  );
}

type HoldingRow = NonNullable<Awaited<ReturnType<typeof getHolding>>>;
type Activity = Awaited<ReturnType<typeof loadHoldingActivity>>;

function glanceRows({ h, teamName, leadNames, next, moves, base, now, showPosition }: { h: HoldingRow["h"]; teamName: string; leadNames: string[]; next: Activity["reports"][number] | undefined; moves: Activity["moves"]; base: string; now: number; showPosition: boolean }): GlanceRow[] {
  const shares = h.shares != null ? `${fmtNumber(h.shares, 2)} sh` : null;
  const open = moves.filter((mv) => mv.status !== "completed");
  const overdue = open.find((mv) => mv.dueAt && mv.dueAt.getTime() < now);
  const last = moves[0];
  const expectations = next ? (next.preLockedAt ? "Locked in" : next.expectations?.trim() ? "Draft" : "Not started") : null;
  const link = "text-body font-semibold hover:underline";
  const rows: GlanceRow[] = [
    {
      label: "Team",
      value: teamName,
      title: leadNames.length ? `The whole team covers it. Movement alerts go to its ${leadNames.length > 1 ? "leads" : "lead"}, ${leadNames.join(", ")}.` : "The whole team covers it. It has no lead analyst yet, so movement alerts go to everyone on it.",
    },
    ...(showPosition ? [{ label: "Position", value: shares ?? <span className="text-muted-foreground">Not recorded</span> }] : []),
    {
      label: "Next report",
      value: next ? `${shortDate(next.reportDate)}${hourLabel(next.reportHour) ? `, ${hourLabel(next.reportHour)}` : ""}${next.dateStatus === "estimated" ? " (est.)" : ""}` : <span className="text-muted-foreground">None scheduled</span>,
    },
    {
      label: "Expectations",
      value: expectations ?? <span className="text-muted-foreground">—</span>,
      title: next && !next.preLockedAt ? `Due ${shortDate(expectationsDue(next.reportDate, next.reportHour))}` : undefined,
      action: next ? (
        <Link href={`${base}/earnings/${next.id}`} className={next.preLockedAt ? `${link} text-muted-foreground` : expectations === "Not started" ? `${link} text-caution-foreground` : link}>
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
        <Link href={`${base}/movements/${open[0].id}`} className={overdue ? `${link} text-down` : link}>
          Open
        </Link>
      ) : undefined,
    },
  ];
  return rows;
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

/** `years` full years back plus a calendar cushion for the starting trading session. */
function historyStart(years: number) {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() - 10);
  return date.toISOString().slice(0, 10);
}

/** Read once per request; a helper so the render stays free of impure calls. */
function nowMs() {
  return Date.now();
}
