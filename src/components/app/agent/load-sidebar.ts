import "server-only";
import { effectiveRunStatus, listGeneralChats, listRecentHoldingChats, type ChatViewer } from "@/lib/chats";
import type { TeamIds } from "@/lib/team-filter";
import { boardHref } from "@/lib/scope";
import type { ResearchSidebarData } from "./conversation-list";

/**
 * The Research list for a scope: recent holding-board chats and general conversations, newest first. Boards open in
 * `scopeSlug` when it shows them (the fund shows every team's), so picking a chat never changes the scope.
 */
export async function loadResearchSidebar(teamIds: TeamIds, viewer: ChatViewer, scopeSlug: string | null = null): Promise<ResearchSidebarData> {
  const [boards, general] = await Promise.all([listRecentHoldingChats(teamIds, viewer), listGeneralChats(teamIds, viewer)]);
  return {
    boards: boards.map(({ c, authorName, questions, ticker, teamSlug }) => ({
      id: c.id,
      href: boardHref(scopeSlug, teamSlug, ticker, c.id),
      title: c.title,
      authorName,
      questions,
      updatedAt: c.updatedAt.toISOString(),
      running: effectiveRunStatus(c) === "running",
      ticker,
      holdingId: c.holdingId ?? undefined,
    })),
    general: general.map(({ c, authorName, questions }) => ({
      id: c.id,
      href: `/hoot/${c.id}`,
      title: c.title,
      authorName,
      questions,
      updatedAt: c.updatedAt.toISOString(),
      running: effectiveRunStatus(c) === "running",
    })),
  };
}
