import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { canAccessTeam, isFundWide, requireUser, transparencyEnabled } from "@/lib/auth";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { getTeam } from "@/lib/teams";
import { effectiveRunStatus, getChat, loadMessages } from "@/lib/chats";
import { listTeamHoldings } from "@/lib/holdings";
import { deleteChat } from "@/lib/actions/chats";
import { agentConfigured } from "@/lib/agent/model";
import { ChatPanel } from "@/components/app/chat/chat-panel";
import { Button } from "@/components/ui/button";

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
  if (!chat || !canAccessTeam(user, chat.teamId)) notFound();
  const team = await getTeam(chat.teamId);
  if (!team) notFound();
  const holdings = await listTeamHoldings(team.id, "all");
  const pinned = holdings.find(({ h }) => h.id === chat.holdingId)?.h.ticker;
  if (pinned) redirect(`/t/${team.slug}/agent/h/${pinned}?chat=${chat.id}`);
  const messages = await loadMessages(chat.id);
  const tickers = holdings.filter(({ h }) => h.status === "active").map(({ h }) => h.ticker);
  const home = `/t/${isFundWide(user) ? FUND_SCOPE_SLUG : team.slug}/agent`;

  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <Button nativeButton={false} render={<Link href={home} />} variant="ghost" size="sm">
          <ArrowLeft />
          Hoot
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{chat.title === "New chat" ? "New conversation" : chat.title}</div>
        <form action={deleteChat}>
          <input type="hidden" name="id" value={chat.id} />
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            <Trash2 />
            Delete
          </Button>
        </form>
      </div>
      <ChatPanel chatId={chat.id} initialMessages={messages} initialRunStatus={effectiveRunStatus(chat)} tickers={tickers} configured={agentConfigured()} transparency={transparencyEnabled(user)} />
    </>
  );
}
