import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { loadTeam } from "@/lib/teams";
import { transparencyEnabled } from "@/lib/auth";
import { effectiveRunStatus, getChat, loadMessages } from "@/lib/chats";
import { listTeamHoldings } from "@/lib/holdings";
import { deleteChat } from "@/lib/actions/chats";
import { agentConfigured } from "@/lib/agent/model";
import { ChatPanel } from "@/components/app/chat/chat-panel";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Agent" };

/** Holding chats open on the holding's research board; team-wide chats (no pinned holding) keep this panel. */
export default async function ChatPage({ params }: { params: Promise<{ team: string; chatId: string }> }) {
  const { team: slug, chatId } = await params;
  const { team, user } = await loadTeam(slug);
  const chat = await getChat(chatId);
  if (!chat || chat.teamId !== team.id) notFound();
  const holdings = await listTeamHoldings(team.id, "all");
  const pinned = holdings.find(({ h }) => h.id === chat.holdingId)?.h.ticker;
  if (pinned) redirect(`/t/${team.slug}/agent/h/${pinned}?chat=${chat.id}`);
  const messages = await loadMessages(chat.id);
  const tickers = holdings.filter(({ h }) => h.status === "active").map(({ h }) => h.ticker);

  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <Button nativeButton={false} render={<Link href={`/t/${team.slug}/agent`} />} variant="ghost" size="sm">
          <ArrowLeft />
          Holdings
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">
          {chat.title}
          <span className="ml-2 text-xs text-muted-foreground">team-wide chat</span>
        </div>
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
