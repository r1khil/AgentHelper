import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Sparkles } from "lucide-react";
import { loadTeam } from "@/lib/teams";
import { listChats } from "@/lib/chats";
import { listTeamHoldings } from "@/lib/holdings";
import { createChat } from "@/lib/actions/chats";
import { relativeTime } from "@/lib/format";
import { agentConfigured, agentModelId } from "@/lib/agent/model";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { NativeSelect } from "@/components/app/native-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Agent" };

export default async function AgentIndex({ params }: { params: Promise<{ team: string }> }) {
  const { team: slug } = await params;
  const { team } = await loadTeam(slug);
  const [rows, holdings] = await Promise.all([listChats(team.id), listTeamHoldings(team.id)]);
  return (
    <>
      <PageHeader
        title="Research agent"
        description={agentConfigured() ? `Evidence with sources. Model: ${agentModelId()}.` : "Not configured: set OPENROUTER_API_KEY."}
        actions={
          <form action={createChat} className="flex items-center gap-2">
            <input type="hidden" name="teamId" value={team.id} />
            <NativeSelect name="holdingId" defaultValue="" className="w-44">
              <option value="">Whole team</option>
              {holdings.map(({ h }) => (
                <option key={h.id} value={h.id}>
                  Pin to {h.ticker}
                </option>
              ))}
            </NativeSelect>
            <Button type="submit" size="sm">
              <Plus />
              New chat
            </Button>
          </form>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="No chats yet">Start a chat to pull filings, prices, and news for your holdings. Chats are shared with your team.</EmptyState>
      ) : (
        <Card className="divide-y p-0">
          {rows.map(({ c, authorName, ticker }) => (
            <Link key={c.id} href={`/t/${team.slug}/agent/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
              <Sparkles className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.title}</div>
                <div className="text-xs text-muted-foreground">
                  {authorName ?? "Unknown"} · {relativeTime(c.updatedAt)}
                </div>
              </div>
              {ticker && <Badge variant="outline">{ticker}</Badge>}
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}
