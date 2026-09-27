import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { canOpenChat, isFundWide, listAccessibleTeams, requireUser, transparencyEnabled } from "@/lib/auth";
import { getTeam } from "@/lib/teams";
import { effectiveRunStatus, getChat, loadMessages } from "@/lib/chats";
import { listTeamHoldings } from "@/lib/holdings";
import { deleteChat } from "@/lib/actions/chats";
import { agentConfigured } from "@/lib/agent/model";
import { ChatWorkspace } from "@/components/app/chat/chat-panel";
import { headerAction } from "@/components/app/chat/styles";
import { TraceToggle } from "@/components/app/chat/trace-toggle";
import { ConversationSidebar } from "@/components/app/agent/conversation-list";
import { loadResearchSidebar } from "@/components/app/agent/load-sidebar";

export const metadata: Metadata = { title: "Hoot" };

/**
 * A general Hoot conversation (not about one holding). It lives outside /t/<team> on purpose: the team it is filed
 * under is bookkeeping, so opening it never changes the sector in the sidebar and changing the sector never closes it.
 * Holding chats open on the holding's research board instead.
 */
export default async function HootChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const user = await requireUser();
  const chat = await getChat(chatId);
  if (!chat || !canOpenChat(user, chat)) notFound();
  const team = await getTeam(chat.teamId);
  if (!team) notFound();
  const holdings = await listTeamHoldings(team.id, "all");
  const pinned = holdings.find(({ h }) => h.id === chat.holdingId)?.h.ticker;
  if (pinned) redirect(`/t/${team.slug}/agent/h/${pinned}?chat=${chat.id}`);
  const fundWide = isFundWide(user);
  // The list follows the reader's usual scope: every team for execs and admins, their own team otherwise.
  const scopeIds = fundWide ? (await listAccessibleTeams(user)).map((t) => t.id) : team.id;
  const [messages, sidebar] = await Promise.all([loadMessages(chat.id), loadResearchSidebar(scopeIds, { fundWide })]);
  const tickers = holdings.filter(({ h }) => h.status === "active").map(({ h }) => h.ticker);
  const author = sidebar.general.find((c) => c.id === chat.id)?.authorName ?? (chat.createdBy === user.id ? user.fullName : null);
  const transparency = transparencyEnabled(user);

  return (
    <ChatWorkspace
      sidebar={<ConversationSidebar data={sidebar} selectedId={chat.id} teamSlug={fundWide ? null : team.slug} configured={agentConfigured()} />}
      title={chat.title}
      team={team.name}
      author={author}
      actions={
        <>
          {fundWide && <TraceToggle on={transparency} />}
          <form action={deleteChat} className="flex">
            <input type="hidden" name="id" value={chat.id} />
            <button type="submit" className={`${headerAction} hover:text-destructive`}>
              <Trash2 />
              Delete
            </button>
          </form>
        </>
      }
      chatId={chat.id}
      initialMessages={messages}
      initialRunStatus={effectiveRunStatus(chat)}
      tickers={tickers}
      configured={agentConfigured()}
      transparency={transparency}
    />
  );
}
