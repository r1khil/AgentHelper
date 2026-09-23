import type { Metadata } from "next";
import { loadScope } from "@/lib/teams";
import { effectiveRunStatus, listGeneralChats, listHoldingChatStats } from "@/lib/chats";
import { listTeamHoldings } from "@/lib/holdings";
import { listTeamMovements } from "@/lib/movements";
import { listTeamEarnings } from "@/lib/earnings";
import { marketSnapshot } from "@/lib/market";
import { agentConfigured } from "@/lib/agent/model";
import { EmptyState } from "@/components/app/empty-state";
import { HoldingCards, type HoldingCardData, type MarketByTicker } from "@/components/app/agent/holding-cards";
import { AskHoot } from "@/components/app/agent/ask-hoot";
import { ConversationList, type ConversationRow } from "@/components/app/agent/conversation-list";

export const metadata: Metadata = { title: "Hoot" };

/** Hoot's home: ask a general question, pick up an earlier conversation, or open a holding's research board. */
export default async function AgentIndex({ params }: { params: Promise<{ team: string }> }) {
  const { team: slug } = await params;
  const scope = await loadScope(slug);
  const { teamIds, teamById } = scope;
  const [rows, stats, movements, earnings, general] = await Promise.all([
    listTeamHoldings(teamIds),
    listHoldingChatStats(teamIds),
    listTeamMovements(teamIds),
    listTeamEarnings(teamIds),
    listGeneralChats(teamIds),
  ]);
  // Not awaited: the cards render from the database at once and the quotes stream in when Yahoo answers.
  const market: Promise<MarketByTicker> = marketSnapshot(rows.map((r) => r.h.ticker)).then((m) =>
    Object.fromEntries(Object.entries(m.rows).map(([t, r]) => [t, { changePct: r.quote?.changePct, relativePp: r.relativePp }])),
  );

  const today = new Date().toISOString().slice(0, 10);
  const openMovement = new Map<string, { dueAt: string | null }>();
  for (const { m } of movements) {
    if ((m.status === "open" || m.status === "in_progress") && !openMovement.has(m.holdingId)) openMovement.set(m.holdingId, { dueAt: m.dueAt?.toISOString() ?? null });
  }
  const nextReport = new Map<string, HoldingCardData["earnings"]>();
  for (const { e } of [...earnings].sort((a, b) => a.e.reportDate.localeCompare(b.e.reportDate))) {
    if (e.status === "upcoming" && e.reportDate >= today && !nextReport.has(e.holdingId)) {
      nextReport.set(e.holdingId, { reportDate: e.reportDate, dateStatus: e.dateStatus, hasExpectations: Boolean(e.expectations?.trim()) });
    }
  }

  const holdings: HoldingCardData[] = rows.map(({ h }) => {
    const s = stats.get(h.id);
    return {
      id: h.id,
      ticker: h.ticker,
      name: h.companyName,
      href: `/t/${teamById.get(h.teamId)?.slug}/agent/h/${h.ticker}`,
      chats: s?.chats ?? 0,
      sources: s?.sources ?? 0,
      lastActivity: s?.lastActivity.toISOString() ?? null,
      running: s?.running,
      movement: openMovement.get(h.id),
      earnings: nextReport.get(h.id),
    };
  });

  const conversations: ConversationRow[] = general.map(({ c, authorName, questions }) => ({
    id: c.id,
    title: c.title,
    authorName,
    questions,
    updatedAt: c.updatedAt.toISOString(),
    running: effectiveRunStatus(c) === "running",
  }));
  const configured = agentConfigured();

  return (
    <>
      {!configured && <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">Hoot is not configured: set OPENROUTER_API_KEY.</div>}
      <h1 className="text-xl font-semibold tracking-tight">Hoot</h1>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">Your research companion. Every fact comes with a source.</p>
      <div className="mb-8 max-w-2xl">
        <AskHoot teamSlug={scope.kind === "team" ? scope.slug : null} configured={configured} />
      </div>
      <ConversationList rows={conversations} />
      {rows.length === 0 ? (
        <EmptyState title="No holdings yet" hoot="wave">Add the tickers {scope.kind === "fund" ? "each team covers on its" : "this team covers on the"} Holdings page. Each one gets its own research board here.</EmptyState>
      ) : (
        <HoldingCards holdings={holdings} market={market} />
      )}
    </>
  );
}
