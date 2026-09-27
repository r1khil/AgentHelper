import type { Metadata } from "next";
import { loadScope } from "@/lib/teams";
import { isFundWide } from "@/lib/roles";
import { listHoldingChatStats } from "@/lib/chats";
import { listTeamHoldings } from "@/lib/holdings";
import { listTeamMovements } from "@/lib/movements";
import { listTeamEarnings } from "@/lib/earnings";
import { marketSnapshot } from "@/lib/market";
import { agentConfigured } from "@/lib/agent/model";
import { HoldingCards, type HoldingCardData, type MarketByTicker } from "@/components/app/agent/holding-cards";
import { AskHoot } from "@/components/app/agent/ask-hoot";
import { HootHomeIntro } from "@/components/app/agent/hoot-home";
import { ConversationSidebar } from "@/components/app/agent/conversation-list";
import { loadResearchSidebar } from "@/components/app/agent/load-sidebar";
import { CenterColumn, ListColumn, ResearchGrid, SideColumn } from "@/components/app/agent/research-columns";

export const metadata: Metadata = { title: "Hoot" };

/** Hoot's home: ask a general question, pick up an earlier conversation, or open a holding's research board. */
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
    loadResearchSidebar(teamIds, viewer),
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
      href: `/t/${teamById.get(h.teamId)?.slug}/agent/h/${h.ticker}`,
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

  return (
    <ResearchGrid>
      <ListColumn>
        <ConversationSidebar data={sidebar} teamSlug={teamSlug} configured={configured} />
      </ListColumn>
      <CenterColumn>
        <div className="flex h-12 shrink-0 items-center gap-2.5 border-b px-7">
          <h2 className="text-sm font-semibold">New conversation</h2>
          <span className="truncate text-[12.5px] text-muted-foreground">General question · {scopeName}</span>
        </div>
        {!configured && <div className="mx-6 mt-4 rounded-[10px] bg-caution px-3 py-2 text-[13px] text-caution-foreground xl:mx-14">Hoot is not configured: set OPENROUTER_API_KEY.</div>}
        <HootHomeIntro ticker={rows[0]?.h.ticker} configured={configured} />
        <AskHoot teamSlug={teamSlug} configured={configured} />
      </CenterColumn>
      <SideColumn>
        {rows.length === 0 ? (
          <>
            <h2 className="text-sm font-semibold">Research boards</h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
              No holdings yet. Add the tickers {scope.kind === "fund" ? "each team covers on its" : "this team covers on the"} Holdings page. Each one gets its own research board here.
            </p>
          </>
        ) : (
          <HoldingCards holdings={holdings} market={market} />
        )}
      </SideColumn>
    </ResearchGrid>
  );
}
