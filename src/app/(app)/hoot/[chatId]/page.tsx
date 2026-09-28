import type { Metadata } from "next";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { canOpenChat, isFundWide, listAccessibleTeams, requireUser, transparencyEnabled } from "@/lib/auth";
import { getTeam, rememberedScope } from "@/lib/teams";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { boardHref } from "@/lib/scope";
import { effectiveRunStatus, getChat, loadMessages } from "@/lib/chats";
import { listTeamHoldings } from "@/lib/holdings";
import { deleteChat } from "@/lib/actions/chats";
import { agentConfigured } from "@/lib/agent/model";
import { ChatWorkspace } from "@/components/app/chat/chat-panel";
import { headerAction } from "@/components/app/chat/styles";
import { TraceToggle } from "@/components/app/chat/trace-toggle";
import { ConversationSidebar } from "@/components/app/agent/conversation-list";
import { loadResearchSidebar } from "@/components/app/agent/load-sidebar";

// One read per request, shared by the title and the page.
const loadChat = cache(getChat);

export async function generateMetadata({ params }: { params: Promise<{ chatId: string }> }): Promise<Metadata> {
  const { chatId } = await params;
  const [user, chat] = await Promise.all([requireUser(), loadChat(chatId)]);
  // A chat this member can't open gets no title of its own (the page 404s).
  return { title: chat && canOpenChat(user, chat) ? `${chat.title} · Research` : "Research" };
}

/**
 * A general chat with Hoot (not about one holding), under Research. It lives outside /t/<team> on purpose: the team
 * it is filed under is bookkeeping, so opening it never changes the sector in the sidebar and changing the sector
 * never closes it. Holding chats open on the holding's research instead.
 */
export default async function HootChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const user = await requireUser();
  const chat = await loadChat(chatId);
  if (!chat || !canOpenChat(user, chat)) notFound();
  const team = await getTeam(chat.teamId);
  if (!team) notFound();
  const [holdings, remembered, accessible] = await Promise.all([listTeamHoldings(team.id, "all"), rememberedScope(user), listAccessibleTeams(user)]);
  const pinned = holdings.find(({ h }) => h.id === chat.holdingId)?.h.ticker;
  if (pinned) redirect(boardHref(remembered, team.slug, pinned, chat.id));
  const fundWide = isFundWide(user);
  // The list follows the scope the member is in (this page keeps it): the fund's chats or one team's. Without one
  // remembered, every team for execs and admins, their own team otherwise.
  const listScope = remembered ?? (fundWide ? FUND_SCOPE_SLUG : team.slug);
  const scopeIds = listScope === FUND_SCOPE_SLUG ? accessible.map((t) => t.id) : (accessible.find((t) => t.slug === listScope)?.id ?? team.id);
  const [messages, sidebar] = await Promise.all([loadMessages(chat.id), loadResearchSidebar(scopeIds, { fundWide }, listScope)]);
  const tickers = holdings.filter(({ h }) => h.status === "active").map(({ h }) => h.ticker);
  const author = sidebar.general.find((c) => c.id === chat.id)?.authorName ?? (chat.createdBy === user.id ? user.fullName : null);
  const transparency = transparencyEnabled(user);

  return (
    <ChatWorkspace
      sidebar={<ConversationSidebar data={sidebar} selectedId={chat.id} teamSlug={listScope === FUND_SCOPE_SLUG ? null : listScope} configured={agentConfigured()} />}
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
