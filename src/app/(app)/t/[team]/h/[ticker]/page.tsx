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
import { fmtChangeBp, fmtChangeMoney, fmtChangePair, fmtCurrency, fmtDay, fmtDayMonth, fmtTime, ppToBp, relativeTime } from "@/lib/format";
import { canManageTeam, isFundWide } from "@/lib/auth";
import { effectiveRunStatus, listHoldingChats } from "@/lib/chats";
import { documentLabel } from "@/lib/drive/labels";
import { driveStatus, listHoldingFiles } from "@/lib/drive/index";
import { listHoldingFilings } from "@/lib/documents/index";
import { listTradeMarks, loadSecurityLine } from "@/lib/portfolio/holding";
import { agentConfigured } from "@/lib/agent/model";
import { listHoldingMemories } from "@/lib/agent/memory/store";
import type { MemoryEntry } from "@/lib/agent/memory/prompt";
import { expectationsState, expectationsWord, prepPackWord } from "@/lib/earnings-calendar";
import { sellSideHref } from "@/lib/scope";
import { alignPrices } from "@/lib/charts/series";
import { DocumentUploadForm } from "@/components/app/document-upload-form";
import { DocumentSummary } from "@/components/app/document-summary";
import { ThesisProposal } from "@/components/app/thesis-proposal";
import { PageHead } from "@/components/app/page-head";
import { PriceChart } from "@/components/app/price-chart";
import { Pill } from "@/components/app/panel";
import { Tabs } from "@/components/app/tabs";
import { HoldingLogo } from "@/components/app/holding-logo";
import { HoldingChart } from "@/components/app/portfolio/holding-chart";
import { toneOfText } from "@/components/app/portfolio/figures";
import { PrepPackCard } from "@/components/app/agent/prep-pack-card";
import { ResearchMemory } from "@/components/app/agent/research-log-card";
import { holdingSuggestions } from "@/components/app/holdings/suggestions";
import { RecordACall } from "@/components/app/sell-side/new-call";
import { UploadModelDialog } from "@/components/app/models/upload-model-dialog";
import { Button } from "@/components/ui/button";
import { HoldingActions } from "@/components/app/holdings/holding-actions";
import { HoldingAsk } from "@/components/app/holdings/holding-ask";
import { NeedsYou } from "@/components/app/holdings/needs-you";
import { CoverageCard, FundPositionCard, KeyStatsCard } from "@/components/app/holdings/holding-sections";
import { RailCard, type RailRow } from "@/components/app/holdings/rail";
import { RailCardFallback } from "@/components/app/holdings/holding-skeleton";
import { ScreenerCard } from "@/components/app/holdings/screener-card";
import { SinceThesis, type SinceItem } from "@/components/app/holdings/since-thesis";
import { ThesisPanel } from "@/components/app/holdings/thesis-panel";
import { NotesTab, monthDay, type NoteItem } from "@/components/app/holdings/notes";
import { FeedList, TabSection, type FeedItem } from "@/components/app/holdings/holding-feed";
import { DocumentsList, EarningsTab, type EarningsRow } from "@/components/app/holdings/tab-panels";
import { holdingNeeds } from "@/components/app/holdings/attention";
import { listHoldingCalls, modelCounts } from "./_load";

const MATERIAL_FORMS = ["10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A", "20-F", "6-K", "DEF 14A", "S-1", "424B4"];
const TABS = ["all", "threads", "model", "filings", "earnings"] as const;
type Tab = (typeof TABS)[number];
/** The old holding page's tabs, and where each one's content lives now. */
const OLD_TABS: Record<string, Tab> = { overview: "all", research: "threads", documents: "filings", notes: "filings", earnings: "earnings" };
const DAY = 86_400_000;

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  return { title: ticker.toUpperCase() };
}

/**
 * One holding: its name and price over the chart, a box to ask Hoot about it, what it is waiting on, and everything
 * about it in tabs (threads, model, filings and notes, earnings), with the fund's position, the next report
 * and what has happened since the thesis in the rail. Research's holding board, Models, Sell-side calls and
 * the earnings prep all fold in here.
 */
export default async function HoldingPage({ params, searchParams }: { params: Promise<{ team: string; ticker: string }>; searchParams: Promise<{ error?: string; tab?: string }> }) {
  const { team: slug, ticker } = await params;
  const { error: flash, tab: tabParam = "all" } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(tabParam) ? (tabParam as Tab) : (OLD_TABS[tabParam] ?? "all");
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
  const fundWide = isFundWide(user);

  // EDGAR and news are network calls: only the tabs that list them wait for them.
  const wantsFeeds = tab === "all" || tab === "filings";
  const { since, today: newsToday } = newsWindow();
  const none = Promise.resolve([] as never[]);
  const [members, notes, market, bars, spxBars, marks, securityLine, filings, news, drive, docs, proposals, indexedFilings, activity, chats, memories, calls] = await Promise.all([
    listTeamMembers(team.id),
    listNotes(h.id),
    marketSnapshot([h.ticker]),
    getBarsRange(h.ticker, historyStart(5))
      .then((r) => r.bars)
      .catch(() => []),
    tab === "all" ? getBarsRange(SPX_SYMBOL, historyStart(1)).then((r) => r.bars).catch(() => []) : none,
    book ? listTradeMarks(h.ticker).catch(() => []) : none,
    loadSecurityLine(h.ticker).catch(() => null),
    wantsFeeds && h.cik ? listFilings(h.cik, { forms: MATERIAL_FORMS, limit: 8 }).catch(() => []) : none,
    wantsFeeds && finnhubConfigured() ? getCompanyNews(h.ticker, since, newsToday).catch(() => []) : none,
    driveStatus().catch(() => null),
    listHoldingFiles(h.id, 30).catch(() => []),
    listPendingProposals(h.id).catch(() => []),
    listHoldingFilings(h.id, 8).catch(() => []),
    loadHoldingActivity(h.id),
    listHoldingChats(h.id, { fundWide }).catch(() => []),
    listHoldingMemories(h.id).catch(() => [] as MemoryEntry[]),
    listHoldingCalls(team.id, h.ticker).catch(() => []),
  ]);
  const counts = await modelCounts(activity.models.map((m) => m.id));

  const today = todayNY();
  const now = nowMs();
  // Links stay in the scope the holding was opened in.
  const base = `/t/${scope.slug}`;
  const holdingPath = `${base}/h/${encodeURIComponent(h.ticker)}`;
  const tabHref = (t: Tab) => (t === "all" ? holdingPath : `${holdingPath}?tab=${t}`);
  const thesisProposal = !h.thesis?.trim() ? proposals.find((p) => p.field === "thesis") : undefined;
  const driveReady = Boolean(drive?.connected && drive.rootFolderId && !drive.needsReconnect);
  const driveNote = !drive?.configured ? "Google Drive is not set up on this deployment." : !drive.connected || !drive.rootFolderId ? "Ask an admin to connect Google Drive from the Admin page." : drive.needsReconnect ? "Google Drive needs to be reconnected by an admin." : undefined;
  const active = h.status === "active";
  const leadNames = members.filter((mm) => mm.role === "lead_analyst").map((mm) => mm.fullName);
  const latestModel = activity.models[0];
  const toDecide = (id: string) => {
    const c = counts.get(id);
    return c ? c.proposed + c.exceptions : 0;
  };

  // ── Price ──
  const m = market.rows[h.ticker];
  const q = m?.quote;
  const prev = q ? (q.previousClose ?? (q.changePct != null ? q.price / (1 + q.changePct / 100) : undefined)) : undefined;
  const delta = q && prev != null ? q.price - prev : null;
  const deltaPct = q?.changePct ?? (q && prev ? (q.price / prev - 1) * 100 : null);
  const changeText = delta !== null && deltaPct !== null ? fmtChangePair(fmtChangeMoney(delta), deltaPct) : null;
  const tone = changeText ? toneOfText(changeText) : null;
  const bp = ppToBp(m?.relativePp);
  const priceNote = [q ? quoteWhen(q.asOf, q.marketState, today) : (market.error ?? m?.error ?? "Quote unavailable"), bp != null ? `${fmtChangeBp(bp)} against the S&P 500` : null].filter(Boolean).join(". ");

  // ── Earnings ──
  const upcoming = activity.reports.filter((e) => e.status === "upcoming" && e.reportDate >= today).sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  const next = upcoming[0];
  const earningsRows: EarningsRow[] = activity.reports.map((e) => ({
    id: e.id,
    href: `${base}/earnings/${e.id}`,
    date: e.reportDate,
    when: [hourLabel(e.reportHour), e.dateStatus === "estimated" ? "estimated" : "confirmed"].filter(Boolean).join(", "),
    period: e.fiscalPeriod,
    status: e.status,
    expectations: e.preLockedAt ? "locked" : e.expectations?.trim() ? "draft" : "none",
    eps: e.epsEstimate != null ? fmtCurrency(e.epsEstimate, e.epsCurrency) : null,
  }));

  // ── What waits on the team ──
  const needs = holdingNeeds(
    {
      nextReport: next ? { id: next.id, reportDate: next.reportDate, reportHour: next.reportHour, fiscalPeriod: next.fiscalPeriod, locked: !!next.preLockedAt, drafted: !!next.expectations?.trim() } : null,
      models: activity.models.map((mm) => ({ id: mm.id, fileName: mm.fileName, version: mm.version, toDecide: toDecide(mm.id) })),
      thesisProposed: !!thesisProposal,
    },
    { base, today, now },
  );

  // ── Rows, by kind; the All tab mixes them (all but news, which would bury the team's own work: it is on Filings & notes) ──
  const threadItems: FeedItem[] = chats.map(({ c, authorName, questions }) => {
    const running = effectiveRunStatus(c) === "running";
    return {
      key: `thread-${c.id}`,
      kind: "Thread",
      title: c.title,
      sub: `${authorName ?? "Someone"}, ${questions} ${questions === 1 ? "question" : "questions"}`,
      when: running ? "Answering…" : relativeTime(c.updatedAt),
      tone: running ? "caution" : null,
      href: `/hoot/${c.id}`,
      at: c.updatedAt.getTime(),
    };
  });

  const modelItems: FeedItem[] = activity.models.map((mm) => {
    const c = counts.get(mm.id);
    const open = toDecide(mm.id);
    const latest = mm.id === latestModel?.id;
    const state = open > 0 ? `${open} to decide` : !latest ? "Earlier version" : !h.cik ? "Not an SEC filer" : !c?.mappings ? "Nothing mapped yet" : "Up to date";
    return {
      key: `model-${mm.id}`,
      kind: "Model",
      title: mm.fileName,
      sub: [`Version ${mm.version}`, mm.uploader ? `uploaded by ${mm.uploader}` : null, fmtDay(mm.createdAt), c?.mappings ? `${c.mappings} line items mapped` : null, c?.approved ? `${c.approved} values approved` : null].filter(Boolean).join(", "),
      when: state,
      tone: open > 0 ? "caution" : null,
      href: `${base}/models/${mm.id}`,
      at: mm.createdAt.getTime(),
    };
  });
  // "Missing" only where a model can do its job: an ETF or other non-SEC filer has no filings to propose values from.
  const noModel: FeedItem = { key: "model-none", kind: "Model", title: "No model uploaded yet", sub: "Upload an .xlsx to map its values to what the company reports", when: "Missing", tone: "caution", href: tabHref("model"), at: 0 };
  // Models filed in the Fund's Drive (not uploaded here) list on the Model tab too.
  const driveModels = docs.filter((d) => d.kind === "model");

  const indexedItems: FeedItem[] = indexedFilings.map((f) => {
    const at = f.publishedAt?.getTime() ?? 0;
    return {
      key: `sec-${f.id}`,
      kind: f.form ?? "Filing",
      title: f.title,
      sub: ["SEC, indexed for Hoot", now - at < 7 * DAY ? "new" : null].filter(Boolean).join(", "),
      when: f.publishedAt ? fmtDay(f.publishedAt) : undefined,
      hint: f.sectionNote ?? undefined,
      href: f.url ?? undefined,
      external: true,
      at,
    };
  });
  // An EDGAR filing Hoot has indexed already lists once on the All tab, as the indexed one.
  const indexedKeys = new Set(indexedFilings.map((f) => `${f.form}|${f.publishedAt?.toISOString().slice(0, 10)}`));
  const alsoIndexed = new Set(filings.filter((f) => indexedKeys.has(`${f.form}|${f.filedAt}`)).map((f) => `edgar-${f.accession}`));
  const edgarItems: FeedItem[] = filings.map((f) => ({ key: `edgar-${f.accession}`, kind: f.form, title: f.description || f.primaryDocument, sub: "SEC EDGAR", when: fmtDay(f.filedAt), href: f.url, external: true, at: noon(f.filedAt) }));
  const docItems: FeedItem[] = docs.map((d) => {
    const at = d.modifiedTime?.getTime() ?? d.createdAt.getTime();
    const s = d.summary;
    return {
      key: `doc-${d.id}`,
      kind: d.kind === "model" ? "Model file" : "Document",
      title: d.name,
      sub: [documentLabel(d), "Fund's Drive", s?.rating ? `rating ${s.rating}` : null, s?.priceTarget ? `PT ${s.priceTarget}` : null].filter(Boolean).join(", "),
      when: fmtDay(new Date(at)),
      hint: d.path,
      href: d.webViewLink ?? `https://drive.google.com/file/d/${d.id}/view`,
      external: true,
      at,
    };
  });
  const callItems: FeedItem[] = calls.map((c) => {
    const status = callStatus(c.status);
    return {
      key: `call-${c.id}`,
      kind: "Sell-side",
      title: c.title,
      sub: [c.by, status.text].filter(Boolean).join(", "),
      when: fmtDay(c.createdAt),
      tone: status.caution ? "caution" : null,
      href: sellSideHref(scope.slug, team.slug, c.id),
      at: c.createdAt.getTime(),
    };
  });
  const noteItems: NoteItem[] = notes.map(({ n, authorName }) => ({ id: n.id, body: n.body, authorName, createdAt: n.createdAt, canDelete: n.authorId === user.id || manage }));
  const noteFeed: FeedItem[] = noteItems.map((n) => ({ key: `note-${n.id}`, kind: "Note", title: n.body.split(/\n/)[0], sub: n.authorName ?? "Unknown", when: fmtDay(n.createdAt), href: `${tabHref("filings")}#notes`, at: n.createdAt.getTime() }));
  const newsItems: FeedItem[] = news.slice(0, 8).map((n) => ({ key: `news-${n.id}`, kind: "News", title: n.headline, sub: n.source, when: relativeTime(n.publishedAt), href: n.url, external: true, at: Date.parse(n.publishedAt) }));

  const reportItems: FeedItem[] = activity.reports.map((e) => {
    const upcomingReport = e.status === "upcoming" && e.reportDate >= today;
    const word = expectationsWord(expectationsState(e), e, today);
    const prep = upcomingReport ? prepPackWord({ reportDate: e.reportDate, status: e.status, prepPackAt: e.prepPack ? (e.prepPack as { builtAt?: string }).builtAt ?? null : null }, today) : null;
    return {
      key: `report-${e.id}`,
      kind: "Earnings",
      title: `${e.fiscalPeriod ? `${e.fiscalPeriod} report` : "Earnings report"}${upcomingReport ? " and prep pack" : ""}`,
      sub: upcomingReport
        ? [`Expectations ${lowerFirst(word.text)}`, e.epsEstimate != null ? `EPS est. ${fmtCurrency(e.epsEstimate, e.epsCurrency)}` : null, prep && prep.text !== "—" ? `prep pack ${lowerFirst(prep.text)}` : null].filter(Boolean).join(", ")
        : e.status === "reviewed"
          ? "Reviewed"
          : e.preLockedAt
            ? "Results in, reflection due"
            : "Reported, expectations were not locked",
      when: `${upcomingReport ? "Reports " : ""}${fmtDay(e.reportDate)}${e.dateStatus === "estimated" && upcomingReport ? " (est.)" : ""}`,
      tone: upcomingReport && word.tone === "caution" ? "caution" : null,
      href: `${base}/earnings/${e.id}`,
      at: noon(e.reportDate),
    };
  });

  const allItems = [...threadItems, ...(modelItems.length || !h.cik ? modelItems : [noModel]), ...indexedItems, ...edgarItems.filter((f) => !alsoIndexed.has(f.key)), ...docItems, ...callItems, ...noteFeed, ...reportItems]
    .sort((a, b) => b.at - a.at)
    .slice(0, 40);

  // ── Tabs ──
  const openModelValues = activity.models.reduce((n, mm) => n + toDecide(mm.id), 0);
  const tabs = [
    { key: "all" as const, label: "All" },
    { key: "threads" as const, label: "Threads", count: chats.length || undefined },
    { key: "model" as const, label: "Model", count: openModelValues || undefined, hot: openModelValues > 0 },
    { key: "filings" as const, label: "Filings & notes" },
    { key: "earnings" as const, label: "Earnings", count: next ? fmtDayMonth(next.reportDate) : undefined },
  ].map((t) => ({ ...t, href: tabHref(t.key), active: t.key === tab }));

  // ── Rail ──
  const coverage: RailRow[] = [
    {
      k: "Team",
      v: team.name,
      title: leadNames.length ? `The whole team covers it. Its ${leadNames.length > 1 ? "leads are" : "lead is"} ${leadNames.join(", ")}.` : "The whole team covers it. It has no lead analyst yet.",
    },
    { k: leadNames.length > 1 ? "Leads" : "Lead", v: leadNames.length ? leadNames.join(", ") : "None yet", tone: leadNames.length ? null : "muted" },
  ];
  const nextWord = next ? expectationsWord(expectationsState(next), next, today) : null;
  const nextPrep = next ? prepPackWord({ reportDate: next.reportDate, status: next.status, prepPackAt: next.prepPack ? ((next.prepPack as { builtAt?: string }).builtAt ?? null) : null }, today) : null;
  const nextRows: RailRow[] = next
    ? [
        { k: "Date", v: `${fmtDay(next.reportDate)}${next.dateStatus === "estimated" ? " (est.)" : ""}`, title: next.dateStatus === "estimated" ? "Estimated, not confirmed by the company" : "Confirmed by the company" },
        { k: "Time", v: capitalise(hourLabel(next.reportHour)) || "Not announced", tone: next.reportHour ? null : "muted" },
        ...(next.fiscalPeriod ? [{ k: "Period", v: next.fiscalPeriod }] : []),
        { k: "EPS estimate", v: next.epsEstimate != null ? fmtCurrency(next.epsEstimate, next.epsCurrency) : "—", tone: next.epsEstimate != null ? null : "muted" },
        { k: "Expectations", v: nextWord!.text, tone: nextWord!.tone === "caution" ? "caution" : nextWord!.tone === "grey" ? "muted" : null, title: nextWord!.title },
        ...(nextPrep && nextPrep.text !== "—" ? [{ k: "Prep pack", v: nextPrep.text, tone: nextPrep.tone === "caution" ? ("caution" as const) : ("muted" as const) }] : []),
      ]
    : [];

  // What has been recorded since the thesis: Hoot's notes from threads about the holding.
  const thesisAt = h.thesisUpdatedAt?.getTime() ?? 0;
  const hootNotes = memories.filter((mm) => mm.kind === "log" && Date.parse(mm.createdAt) >= thesisAt).slice(0, 2);
  const sinceItems: SinceItem[] = [
    ...hootNotes.map((mm): SinceItem => ({ key: mm.id, by: "hoot", text: mm.body, label: mm.meta?.chatId ? "Hoot, from a thread" : "Hoot", at: mm.createdAt, href: mm.meta?.chatId ? `/hoot/${mm.meta.chatId}` : undefined })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // The chips under the ask box: Hoot's own follow-ups from the research log when there are some, else three built
  // from what the page knows (the latest filing and report).
  const lastFiling = indexedFilings[0]?.form ?? filings[0]?.form;
  const t = h.ticker;
  const suggestions = holdingSuggestions(memories, () => [
    `What moved ${t} today?`,
    lastFiling ? `Summarise the latest ${lastFiling}` : "Summarise the latest filing",
    next ? `What to watch in the ${next.fiscalPeriod ? `${next.fiscalPeriod} ` : ""}report?` : `What's on file about ${t}?`,
  ]);

  const ask = (
    <HoldingAsk teamId={team.id} holdingId={h.id} ticker={h.ticker} suggestions={suggestions} configured={agentConfigured()} />
  );

  return (
    <>
      <PageHead
        crumbs={[{ label: "Portfolio", href: base }, { label: h.ticker }]}
        tabs={false}
        actions={
          <HoldingActions
            ticker={h.ticker}
            holdingId={h.id}
            companyName={h.companyName}
            hasModel={!!latestModel}
            canUpload={active}
            canUploadModel={active && !!h.cik}
            uploadDisabledReason={driveNote}
            trade={fundWide ? { today, shares: h.shares != null ? Number(h.shares) : null } : null}
            canExit={manage && active}
            links={h.cik ? [{ label: "Open on SEC EDGAR", href: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${h.cik}`, external: true }] : []}
          />
        }
      />
      <div className="flex gap-10">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3">
            <HoldingLogo ticker={h.ticker} size={40} />
            <div className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 truncate text-display font-semibold tracking-[-0.01em]">
                {h.companyName}
                {!active && <Pill>Exited</Pill>}
              </span>
              <span className="truncate text-body text-muted-foreground">
                {h.ticker}
                {q?.exchange ? ` on ${q.exchange}` : ""},{" "}
                <Link href={`/t/${team.slug}`} className="hover:text-foreground hover:underline">
                  {team.name} team
                </Link>
              </span>
            </div>
          </div>
          <div className="mt-[18px] flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-hero leading-none font-semibold tracking-[-0.03em] tabular-nums">{q ? fmtCurrency(q.price, q.currency) : "—"}</span>
            {changeText && <span className={tone === "up" ? "text-emph font-medium text-up" : tone === "down" ? "text-emph font-medium text-down" : "text-emph font-medium"}>{changeText}</span>}
            <span className="text-body text-muted-foreground">{priceNote}</span>
          </div>
          <HoldingChart ticker={h.ticker} bars={bars} marks={marks} currency={q?.currency} />
          {ask}
          <NeedsYou rows={needs} />

          <Tabs label={`${h.ticker} sections`} items={tabs} scroll={false} className="mt-[26px] gap-[22px]" />

          <div className="flex min-w-0 flex-col pt-1">
            {tab === "all" && (
              <>
                <FeedList label={`Everything on ${h.ticker}`} items={allItems} empty={`Nothing on ${h.ticker} yet. Threads, models, filings and reports show here as they come in.`} />
                <div className="mt-8">
                  <PriceChart data={alignPrices(bars.filter((b) => b.date >= historyStart(1)), spxBars)} ticker={h.ticker} currency={q?.currency} />
                </div>
              </>
            )}

            {tab === "threads" && (
              <>
                <FeedList label={`Threads about ${h.ticker}`} items={threadItems} empty={`No threads about ${h.ticker} yet. Ask above; threads started from an earnings prep pack show here too.`} />
                <div className="mt-8 max-w-[560px]">
                  <ResearchMemory ticker={h.ticker} entries={memories} canManage={manage} />
                </div>
              </>
            )}

            {tab === "model" && (
              <>
                <TabSection id="model-h" title="Uploaded models" count={activity.models.length} aside={active ? <UploadModelDialog targets={[{ id: h.id, ticker: h.ticker, companyName: h.companyName, hasModel: !!latestModel }]} label={latestModel ? "Upload a new version" : "Upload .xlsx"} /> : undefined}>
                  <FeedList
                    label={`Models of ${h.ticker}`}
                    items={modelItems}
                    empty={
                      h.cik
                        ? `No model uploaded yet. Upload an .xlsx: map its line items once to what ${h.ticker} reports to the SEC, and Hoot proposes each new period's values with a source for every number.`
                        : `No model uploaded. ${h.ticker} isn't an SEC filer, so Hoot has no filings to propose a model's values from.`
                    }
                  />
                </TabSection>
                {driveModels.length > 0 && (
                  <TabSection id="drive-models-h" title="Models in the Fund's Drive" count={driveModels.length}>
                    <FeedList label="Models in the Fund's Drive" items={docItems.filter((d) => d.kind === "Model file")} />
                  </TabSection>
                )}
                <AllLink href={`${base}/models`}>All models</AllLink>
              </>
            )}

            {tab === "filings" && (
              <>
                <TabSection id="sec-h" title="SEC filings" count={indexedFilings.length} aside="Indexed for Hoot">
                  <FeedList label="SEC filings indexed for Hoot" items={indexedItems} empty={h.cik ? "No filings indexed yet. The morning sweep indexes 10-K, 10-Q and 8-K filings; an admin can backfill two years from the Admin page." : "No SEC registrant matched this ticker."} />
                </TabSection>
                <TabSection
                  id="edgar-h"
                  title="Recent filings on EDGAR"
                  aside={
                    h.cik ? (
                      <a href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${h.cik}`} target="_blank" rel="noreferrer" className="hover:text-foreground">
                        CIK {Number(h.cik)}
                      </a>
                    ) : (
                      "No CIK"
                    )
                  }
                >
                  <FeedList label="Recent filings on EDGAR" items={edgarItems} empty={h.cik ? "No filings found." : "No SEC registrant matched this ticker."} />
                </TabSection>
                <TabSection id="docs-h" title="Team documents" count={docs.length} aside={driveReady ? "In the Fund's Drive" : undefined}>
                  <DocumentsList
                    docs={docs.map((d) => ({
                      id: d.id,
                      name: d.name,
                      href: d.webViewLink ?? `https://drive.google.com/file/d/${d.id}/view`,
                      label: documentLabel(d),
                      path: d.path,
                      modified: d.modifiedTime,
                      summary: <DocumentSummary summary={d.summary} summaryModel={d.summaryModel} summarizedAt={d.summarizedAt} />,
                    }))}
                    empty={driveReady ? "Nothing filed for this holding yet. Hoot reads these documents for context." : "Hoot reads the team's initiating report, earnings updates, and model from the Fund's Drive."}
                  />
                  {active && (
                    <div className="mt-3">
                      <DocumentUploadForm holdingId={h.id} disabledReason={driveNote} />
                    </div>
                  )}
                </TabSection>
                <TabSection id="calls-h" title="Sell-side calls" count={calls.length} aside={<RecordACall variant="secondary" team={team.slug} teamId={team.id} holdings={[{ id: h.id, ticker: h.ticker, companyName: h.companyName }]} scope={scope.slug} />}>
                  <FeedList label={`Sell-side calls on ${h.ticker}`} items={callItems} empty={`No calls on ${h.ticker} recorded yet. A call's brief, transcript and follow-up chat open from here.`} />
                  <AllLink href={`${base}/sell-side`}>All calls</AllLink>
                </TabSection>
                <div id="notes" className="mt-7 scroll-mt-6">
                  <NotesTab holdingId={h.id} notes={noteItems} />
                </div>
                <TabSection id="news-h" title="News" aside="Last 7 days">
                  <FeedList label={`News on ${h.ticker}`} items={newsItems} empty={!finnhubConfigured() ? "News isn't set up yet: an admin needs to turn it on." : "No news in the window."} />
                </TabSection>
              </>
            )}

            {tab === "earnings" && (
              <>
                <TabSection
                  id="next-report-h"
                  title="Next report"
                  aside={
                    next ? (
                      <Button size="sm" variant="secondary" nativeButton={false} render={<Link href={`${base}/earnings/${next.id}`} />}>
                        Open expectations and prep
                      </Button>
                    ) : undefined
                  }
                >
                  {next ? (
                    <div className="pt-3">
                      <p className="text-body text-ink-2">
                        {next.fiscalPeriod ? `${next.fiscalPeriod} report` : "Next report"} {fmtDay(next.reportDate)}
                        {hourLabel(next.reportHour) ? `, ${hourLabel(next.reportHour)}` : ""}
                        {next.dateStatus === "estimated" ? ", estimated" : ", confirmed by the company"}. Expectations are {lowerFirst(nextWord!.text)}.
                      </p>
                      <div className="mt-3">
                        {next.prepPack ? <PrepPackCard pack={next.prepPack} compact /> : <p className="text-caption text-muted-foreground">The prep pack of sourced figures, guidance and questions {nextPrep && nextPrep.text !== "—" ? lowerFirst(nextPrep.text) : "builds before the report"}.</p>}
                      </div>
                    </div>
                  ) : (
                    <p className="py-4 text-body text-muted-foreground">No report is on the calendar yet. The prep pack builds five trading days before one.</p>
                  )}
                </TabSection>
                <EarningsTab rows={earningsRows} calendarHref={scope.kind === "team" ? `/markets?team=${encodeURIComponent(team.slug)}` : "/markets"} />
              </>
            )}
          </div>
        </div>

        <aside aria-label={`${h.ticker} at a glance`} className="flex w-[300px] shrink-0 flex-col gap-[22px] pt-1">
          {book ? (
            <Suspense fallback={<RailCardFallback title="Fund position" rows={10} />}>
              <FundPositionCard ticker={h.ticker} coverage={coverage} />
            </Suspense>
          ) : (
            <CoverageCard coverage={coverage} />
          )}
          <RailCard
            id="next-h"
            title="Next report"
            aside={
              next ? (
                <Link href={`${base}/earnings/${next.id}`} className="hover:text-foreground">
                  Open
                </Link>
              ) : undefined
            }
            rows={next ? nextRows : undefined}
            note={next ? undefined : "None scheduled. The morning sweep adds the next report date once a provider has it."}
          />
          <Suspense fallback={<RailCardFallback title="Screener" rows={2} />}>
            <ScreenerCard ticker={h.ticker} />
          </Suspense>
          <SinceThesis
            thesis={<ThesisPanel compact holdingId={h.id} thesis={h.thesis} meta={h.thesisUpdatedAt ? `updated ${monthDay(h.thesisUpdatedAt)}` : undefined} flash={flash} proposal={thesisProposal ? <ThesisProposal proposal={thesisProposal} /> : undefined} />}
            items={sinceItems}
          />
          <Suspense fallback={<RailCardFallback title="Key statistics" rows={6} />}>
            <KeyStatsCard ticker={h.ticker} currency={q?.currency} asOf={q ? fmtTime(q.asOf) : null} industry={securityLine} />
          </Suspense>
        </aside>
      </div>
    </>
  );
}

/** A quiet link at the end of a tab to the whole list its rows come from (every holding's models, calls). */
function AllLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mt-3 inline-block self-start text-body text-muted-foreground hover:text-foreground hover:underline">
      {children}
    </Link>
  );
}

const noon = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
/** A status word inside a sentence: "Not started" → "not started", keeping a month's capital ("Builds Oct 21" → "builds Oct 21"). */
const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A sell-side call's state in a word, amber while it is working or needs a retry. */
function callStatus(status: string): { text: string; caution: boolean } {
  switch (status) {
    case "ready":
      return { text: "brief ready", caution: false };
    case "error":
      return { text: "failed, retry", caution: true };
    case "transcribing":
    case "summarizing":
    case "analyzing":
      return { text: "processing", caution: true };
    default:
      return { text: "not finished", caution: false };
  }
}

function hourLabel(hour: string | null) {
  return hour === "bmo" ? "before open" : hour === "amc" ? "after close" : hour === "dmh" ? "during market hours" : "";
}

/** "Today at 1:12 PM ET, delayed 15 min" while it trades; "At Friday's close" once the session is over. */
function quoteWhen(asOf: string, marketState: string | undefined, today: string) {
  const t = DateTime.fromISO(asOf).setZone(NY);
  if (!t.isValid) return "Latest price";
  if (marketState === "REGULAR") return `Today at ${fmtTime(asOf)}, delayed 15 min`;
  return t.toISODate() === today ? "At today's close" : `At ${t.toFormat("cccc")}'s close`;
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
