import type { Metadata } from "next";
import { loadTeam } from "@/lib/teams";
import { listHoldingChatStats } from "@/lib/chats";
import { listTeamHoldings } from "@/lib/holdings";
import { listTeamMovements } from "@/lib/movements";
import { listTeamEarnings } from "@/lib/earnings";
import { marketSnapshot } from "@/lib/market";
import { agentConfigured } from "@/lib/agent/model";
import { EmptyState } from "@/components/app/empty-state";
import { HoldingCards, type HoldingCardData, type MarketByTicker } from "@/components/app/agent/holding-cards";

export const metadata: Metadata = { title: "Agent" };

export default async function AgentIndex({ params }: { params: Promise<{ team: string }> }) {
  const { team: slug } = await params;
  const { team } = await loadTeam(slug);
  const [rows, stats, movements, earnings] = await Promise.all([listTeamHoldings(team.id), listHoldingChatStats(team.id), listTeamMovements(team.id), listTeamEarnings(team.id)]);
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
      href: `/t/${team.slug}/agent/h/${h.ticker}`,
      chats: s?.chats ?? 0,
      sources: s?.sources ?? 0,
      lastActivity: s?.lastActivity.toISOString() ?? null,
      running: s?.running,
      movement: openMovement.get(h.id),
      earnings: nextReport.get(h.id),
    };
  });

  return (
    <>
      {!agentConfigured() && <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">The agent is not configured: set OPENROUTER_API_KEY.</div>}
      {rows.length === 0 ? (
        <>
          <h1 className="mb-5 text-xl font-semibold tracking-tight">Research agent</h1>
          <EmptyState title="No holdings yet">Add the tickers this team covers on the Holdings page. Each one gets its own research board here.</EmptyState>
        </>
      ) : (
        <HoldingCards holdings={holdings} market={market} />
      )}
    </>
  );
}
