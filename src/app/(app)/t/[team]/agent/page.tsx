import type { Metadata } from "next";
import { listAccessibleTeams } from "@/lib/auth";
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
import { AskComposer, PromptChips, type AskHolding, type AskScope } from "@/components/app/agent/ask-composer";
import { RecentChats } from "@/components/app/agent/conversation-list";
import { loadResearchSidebar } from "@/components/app/agent/load-sidebar";
import { HootFace } from "@/components/app/chat/thread-parts";
import { PageHead } from "@/components/app/page-head";

export const metadata: Metadata = { title: "Research" };

/** Three questions worth asking of any book; they ask at once. */
const TRY = ["Which holdings report in the next two weeks?", "What did the latest 10-Qs say about guidance?", "Where is our research thin?"];

/** Research: ask Hoot a general question, pick up an earlier chat, or open one holding's research. */
export default async function AgentIndex({ params }: { params: Promise<{ team: string }> }) {
  const { team: slug } = await params;
  const scope = await loadScope(slug);
  const { teamIds, teamById } = scope;
  const fundWide = isFundWide(scope.user);
  const viewer = { fundWide };
  const [rows, stats, movements, earnings, sidebar, accessible] = await Promise.all([
    listTeamHoldings(teamIds),
    listHoldingChatStats(teamIds, viewer),
    listTeamMovements(teamIds),
    listTeamEarnings(teamIds),
    loadResearchSidebar(teamIds, viewer, scope.slug),
    listAccessibleTeams(scope.user),
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
  // A question is filed under the scope in view: the whole fund for execs and admins (or any one team), a team for its members.
  const scopes: AskScope[] = fundWide ? [{ label: "Whole fund", slug: null }, ...accessible.map((t) => ({ label: t.name, slug: t.slug }))] : accessible.filter((t) => teamById.has(t.id)).map((t) => ({ label: t.name, slug: t.slug }));
  const pinnable: AskHolding[] = rows.flatMap(({ h }) => {
    const t = teamById.get(h.teamId);
    return t ? [{ ticker: h.ticker, company: h.companyName, teamSlug: t.slug, team: t.name }] : [];
  });

  return (
    <>
      <PageHead crumbs={[{ label: "Research" }]} scope />
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center pt-3">
        <HootFace className="size-11" />
        <h2 className="mt-3 text-center font-serif text-hero font-normal tracking-[-0.02em]">What should we look into?</h2>
        <p className="mt-2 text-center text-emph text-ink-2">Ask across the whole fund, or open a holding&rsquo;s board to keep its research in one place. Leads start on their own team.</p>
        {!configured && <p className="mt-3 text-body font-medium text-caution-foreground">Hoot isn&rsquo;t set up yet: an admin needs to turn it on.</p>}
        <div className="mt-6 w-full">
          <AskComposer scopes={scopes} defaultScope={teamSlug} holdings={pinnable} placeholder="Ask about a holding, a filing, a move, or the whole book…" configured={configured} />
        </div>
        <div className="mt-4">
          <PromptChips prompts={TRY} teamSlug={teamSlug} configured={configured} />
        </div>
      </div>
      <div className="mx-auto mt-12 grid w-full max-w-[1048px] grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-start gap-12">
        <RecentChats data={sidebar} />
        {rows.length === 0 ? (
          <section aria-labelledby="boards">
            <div className="flex items-baseline border-b pb-1.5">
              <h2 id="boards" className="text-body font-bold">
                Holding boards
              </h2>
            </div>
            <p className="py-3 text-body text-muted-foreground">
              No holdings yet. Add the tickers {scope.kind === "fund" ? "each team covers on its" : "this team covers on the"} Holdings page. Each one gets its own research here.
            </p>
          </section>
        ) : (
          <ResearchBoards holdings={holdings} market={market} showTeam={scope.kind === "fund"} />
        )}
      </div>
    </>
  );
}
