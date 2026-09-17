import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { loadTeam } from "@/lib/teams";
import { getChat, loadMessages } from "@/lib/chats";
import { listTeamHoldings } from "@/lib/holdings";
import { deleteChat } from "@/lib/actions/chats";
import { agentConfigured, agentModelId } from "@/lib/agent/model";
import { ChatPanel } from "@/components/app/chat/chat-panel";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Agent" };

export default async function ChatPage({ params }: { params: Promise<{ team: string; chatId: string }> }) {
  const { team: slug, chatId } = await params;
  const { team } = await loadTeam(slug);
  const chat = await getChat(chatId);
  if (!chat || chat.teamId !== team.id) notFound();
  const [messages, holdings] = await Promise.all([loadMessages(chat.id), listTeamHoldings(team.id)]);
  const pinned = holdings.find(({ h }) => h.id === chat.holdingId)?.h.ticker;
  const tickers = pinned ? [pinned] : holdings.map(({ h }) => h.ticker);

  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <Button nativeButton={false} render={<Link href={`/t/${team.slug}/agent`} />} variant="ghost" size="sm">
          <ArrowLeft />
          Chats
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">
          {chat.title}
          {pinned && <span className="ml-2 text-xs text-muted-foreground">pinned to {pinned}</span>}
        </div>
        <form action={deleteChat}>
          <input type="hidden" name="id" value={chat.id} />
          <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
            <Trash2 />
            Delete
          </Button>
        </form>
      </div>
      <ChatPanel chatId={chat.id} initialMessages={messages} tickers={tickers} configured={agentConfigured()} modelId={agentModelId()} />
    </>
  );
}
