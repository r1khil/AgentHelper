import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { itemTeam, loadScope } from "@/lib/teams";
import { canManageTeam, transparencyEnabled } from "@/lib/auth";
import { effectiveRunStatus, listHoldingChats, loadMessages } from "@/lib/chats";
import { isFundWide } from "@/lib/roles";
import { getHolding } from "@/lib/holdings";
import { getOpenMovement } from "@/lib/movements";
import { marketSnapshot } from "@/lib/market";
import { agentConfigured } from "@/lib/agent/model";
import { listHoldingMemories } from "@/lib/agent/memory/store";
import { getUpcomingEarnings } from "@/lib/earnings";
import { PrepPackCard } from "@/components/app/agent/prep-pack-card";
import { HoldingBoard, type BoardChat, type BoardMarket } from "@/components/app/agent/holding-board";
import { loadResearchSidebar } from "@/components/app/agent/load-sidebar";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} · Research` };
}

export default async function HoldingBoardPage({ params, searchParams }: { params: Promise<{ team: string; ticker: string }>; searchParams: Promise<{ chat?: string }> }) {
  const [{ team: slug, ticker }, { chat: requested }] = await Promise.all([params, searchParams]);
  // The fund scope shows any team's board; a team scope only its own. The list beside it follows the scope.
  const scope = await loadScope(slug);
  const { user } = scope;
  const row = await getHolding(scope.teamIds, ticker);
  if (!row) notFound();
  const { h } = row;
  const team = itemTeam(scope, h.teamId);
  const viewer = { fundWide: isFundWide(user) };
  const [rows, movement, memories, upcoming, sidebar] = await Promise.all([
    listHoldingChats(h.id, viewer),
    getOpenMovement(h.id),
    listHoldingMemories(h.id).catch(() => []),
    getUpcomingEarnings(h.id).catch(() => null),
    loadResearchSidebar(scope.teamIds, viewer, scope.slug),
  ]);
  const fundWide = user.role === "admin" || user.role === "lead_analyst" || user.role === "exec";
  const chats: BoardChat[] = rows.map(({ c, authorName, questions }) => ({
    id: c.id,
    title: c.title,
    authorName,
    questions,
    updatedAt: c.updatedAt.toISOString(),
    canDelete: c.createdBy === user.id || fundWide,
  }));
  const selected = (requested && rows.find((r) => r.c.id === requested)) || rows[0] || null;
  const initialMessages = selected ? await loadMessages(selected.c.id) : [];
  // Not awaited: the header renders at once and the quote fills in when Yahoo answers.
  const market: Promise<BoardMarket> = marketSnapshot([h.ticker]).then((m) => {
    const r = m.rows[h.ticker];
    return { price: r?.quote?.price, changePct: r?.quote?.changePct, relativePp: r?.relativePp, asOf: r?.quote?.asOf };
  });

  return (
    <HoldingBoard
      team={{ id: team.id, slug: team.slug, name: team.name }}
      scopeSlug={scope.slug}
      holding={{ id: h.id, ticker: h.ticker, name: h.companyName }}
      market={market}
      movement={movement ? { id: movement.id, dueAt: movement.dueAt?.toISOString() ?? null, overdue: movement.dueAt ? movement.dueAt < new Date() : false } : null}
      chats={chats}
      initialChatId={selected?.c.id ?? null}
      initialMessages={initialMessages}
      initialRunStatus={selected ? effectiveRunStatus(selected.c) : "idle"}
      configured={agentConfigured()}
      transparency={transparencyEnabled(user)}
      canTrace={isFundWide(user)}
      userName={user.fullName}
      memories={memories}
      canManage={canManageTeam(user, team.id)}
      prepCard={upcoming?.prepPack ? <PrepPackCard pack={upcoming.prepPack} compact /> : undefined}
      sidebar={sidebar}
      newTeamSlug={team.slug}
    />
  );
}
