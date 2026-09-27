import "server-only";
import { effectiveRunStatus, listGeneralChats, listRecentHoldingChats, type ChatViewer } from "@/lib/chats";
import type { TeamIds } from "@/lib/team-filter";
import type { ResearchSidebarData } from "./conversation-list";

/** The Research list for a scope: recent holding-board chats and general conversations, newest first. */
export async function loadResearchSidebar(teamIds: TeamIds, viewer: ChatViewer): Promise<ResearchSidebarData> {
  const [boards, general] = await Promise.all([listRecentHoldingChats(teamIds, viewer), listGeneralChats(teamIds, viewer)]);
  return {
    boards: boards.map(({ c, authorName, questions, ticker, teamSlug }) => ({
      id: c.id,
      href: `/t/${teamSlug}/agent/h/${encodeURIComponent(ticker)}?chat=${c.id}`,
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
