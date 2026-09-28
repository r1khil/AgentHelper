import type { Metadata } from "next";
import { loadScope } from "@/lib/teams";
import { boardHref } from "@/lib/scope";
import { isFundWide } from "@/lib/roles";
import { listHoldingChatStats } from "@/lib/chats";
import { listTeamHoldings } from "@/lib/holdings";
import { listTeamMovements } from "@/lib/movements";
import { listTeamEarnings } from "@/lib/earnings";
import { marketSnapshot } from "@/lib/market";
import { agentConfigured } from "@/lib/agent/model";
import { ResearchBoards, type HoldingCardData, type MarketByTicker } from "@/components/app/agent/research-boards";
import { AskPanel } from "@/components/app/agent/hoot-home";
import { Panel, PanelHeader } from "@/components/app/panel";
import { ConversationSidebar } from "@/components/app/agent/conversation-list";
import { loadResearchSidebar } from "@/components/app/agent/load-sidebar";
import { HomeMain, ListColumn, ResearchHomeGrid } from "@/components/app/agent/research-columns";

export const metadata: Metadata = { title: "Research" };

/** Research: ask Hoot a general question, pick up an earlier chat, or open one holding's research. */
export default async function AgentIndex({ params }: { params: Promise<{ team: string }> }) {
  const { team: slug } = await params;
  const scope = await loadScope(slug);
  const { teamIds, teamById } = scope;
  const viewer = { fundWide: isFundWide(scope.user) };
  const [rows, stats, movements, earnings, sidebar] = await Promise.all([
    listTeamHoldings(teamIds),
    listHoldingChatStats(teamIds, viewer),
    listTeamMovements(teamIds),
    listTeamEarnings(teamIds),
    loadResearchSidebar(teamIds, viewer, scope.slug),
  ]);
  // Not awaited: the boards render from the database at once and the quotes stream in when Yahoo answers.
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
      teamName: scope.kind === "fund" ? teamById.get(h.teamId)?.name : undefined,
      href: boardHref(scope.slug, teamById.get(h.teamId)?.slug ?? scope.slug, h.ticker),
      chats: s?.chats ?? 0,
      sources: s?.sources ?? 0,
      lastActivity: s?.lastActivity.toISOString() ?? null,
      running: s?.running,
      movement: openMovement.get(h.id),
      earnings: nextReport.get(h.id),
    };
  });

  const configured = agentConfigured();
  const teamSlug = scope.kind === "team" ? scope.slug : null;
  const scopeName = scope.kind === "team" ? scope.team.name : "The Fund";
  // Starter questions name a holding worth asking about: one with an open movement, else the latest researched.
  const latest = (h: HoldingCardData) => (h.lastActivity ? Date.parse(h.lastActivity) : 0);
  const suggestFor = holdings.find((h) => h.movement) ?? [...holdings].sort((a, b) => latest(b) - latest(a))[0];

  return (
    <ResearchHomeGrid>
      <ListColumn>
        <ConversationSidebar data={sidebar} teamSlug={teamSlug} configured={configured} />
      </ListColumn>
      <HomeMain>
        <AskPanel ticker={suggestFor?.ticker} configured={configured} teamSlug={teamSlug} scopeName={scopeName} />
        {rows.length === 0 ? (
          <Panel className="flex-1">
            <PanelHeader title="By holding" />
            <p className="px-4 py-4 text-body leading-relaxed text-muted-foreground">
              No holdings yet. Add the tickers {scope.kind === "fund" ? "each team covers on its" : "this team covers on the"} Holdings page. Each one gets its own research here.
            </p>
          </Panel>
        ) : (
          <ResearchBoards holdings={holdings} market={market} showTeam={scope.kind === "fund"} />
        )}
      </HomeMain>
    </ResearchHomeGrid>
  );
}
