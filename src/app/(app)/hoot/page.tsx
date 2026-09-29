import type { Metadata } from "next";
import { isFundWide, listAccessibleTeams, requireUser } from "@/lib/auth";
import { effectiveRunStatus, listGeneralChats, listRecentHoldingChats } from "@/lib/chats";
import { PageHead } from "@/components/app/page-head";
import { ThreadList, type ThreadRow } from "./thread-list";

export const metadata: Metadata = { title: "Threads" };

/** Enough for every thread a small fund keeps; the sidebar shows only the latest few. */
const LIMIT = 1000;

/**
 * All threads: every chat with Hoot the member can open, general and holding ones together, newest first. The sidebar
 * lists the latest; this is where the rest are. Execs and admins also see the fund-wide (no team) threads and the ones
 * that read the price target sheet; everyone else sees their teams' threads.
 */
export default async function ThreadsPage() {
  const user = await requireUser();
  const teams = await listAccessibleTeams(user);
  const viewer = { fundWide: isFundWide(user) };
  const teamIds = teams.map((t) => t.id);
  const [general, holding] = await Promise.all([listGeneralChats(teamIds, viewer, LIMIT), listRecentHoldingChats(teamIds, viewer, LIMIT)]);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const threads: ThreadRow[] = [
    ...general.map(({ c, authorName, questions }) => ({ c, authorName, questions, ticker: null })),
    ...holding.map(({ c, authorName, questions, ticker }) => ({ c, authorName, questions, ticker })),
  ]
    .sort((a, b) => b.c.updatedAt.getTime() - a.c.updatedAt.getTime())
    .map(({ c, authorName, questions, ticker }) => ({
      id: c.id,
      title: c.title,
      ticker,
      where: c.teamId ? (teamName.get(c.teamId) ?? "A team") : "Whole fund",
      authorName,
      questions,
      updatedAt: c.updatedAt.toISOString(),
      running: effectiveRunStatus(c) === "running",
    }));

  return (
    <>
      <PageHead crumbs={[{ label: "Threads" }]} tabs={false} asof={`${threads.length} thread${threads.length === 1 ? "" : "s"}`} />
      <ThreadList threads={threads} />
    </>
  );
}
