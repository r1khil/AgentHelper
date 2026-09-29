import type { Metadata } from "next";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { canOpenChat, isFundWide, listAccessibleTeams, requireUser, transparencyEnabled } from "@/lib/auth";
import { getTeam, rememberedScope } from "@/lib/teams";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { boardHref } from "@/lib/scope";
import { effectiveRunStatus, getChat, loadMessages } from "@/lib/chats";
import { listTeamHoldings } from "@/lib/holdings";
import { deleteChat } from "@/lib/actions/chats";
import { agentConfigured } from "@/lib/agent/model";
import { chatNextQuestions } from "@/lib/agent/memory/store";
import { profiles } from "@/db/schema";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { ChatWorkspace } from "@/components/app/chat/chat-panel";
import type { PinTarget } from "@/components/app/chat/pin-to-board";
import { ShareButton } from "@/components/app/chat/share-button";
import { TraceToggle } from "@/components/app/chat/trace-toggle";
import { Button } from "@/components/ui/button";

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
  // Research in the breadcrumb goes to the scope the member is in (this page keeps it): the fund's chats or one team's.
  // Without one remembered, every team for execs and admins, their own team otherwise.
  const listScope = remembered ?? (fundWide ? FUND_SCOPE_SLUG : team.slug);
  const [messages, related, [author], pinnable] = await Promise.all([
    loadMessages(chat.id),
    chatNextQuestions(chat.id).catch(() => []),
    chat.createdBy ? db.select({ name: profiles.fullName }).from(profiles).where(eq(profiles.id, chat.createdBy)).limit(1) : Promise.resolve([]),
    // The holdings this conversation can be pinned to: any team's for execs and admins, the team's own otherwise.
    listTeamHoldings(fundWide ? accessible.map((t) => t.id) : team.id),
  ]);
  const tickers = holdings.filter(({ h }) => h.status === "active").map(({ h }) => h.ticker);
  const teamById = new Map(accessible.map((t) => [t.id, t]));
  const pinTargets: PinTarget[] = pinnable.flatMap(({ h }) => {
    const t = teamById.get(h.teamId);
    return t ? [{ ticker: h.ticker, company: h.companyName, teamSlug: t.slug, team: t.name }] : [];
  });
  const transparency = transparencyEnabled(user);

  return (
    <ChatWorkspace
      title={chat.title}
      team={team.name}
      teamSlug={team.slug}
      author={author?.name ?? (chat.createdBy === user.id ? user.fullName : null)}
      updatedAt={chat.updatedAt.toISOString()}
      researchHref={`/t/${listScope}/agent`}
      actions={
        <>
          {fundWide && <TraceToggle on={transparency} />}
          <form action={deleteChat} className="flex">
            <input type="hidden" name="id" value={chat.id} />
            <Button type="submit" variant="destructive">
              Delete
            </Button>
          </form>
          <ShareButton />
        </>
      }
      chatId={chat.id}
      initialMessages={messages}
      initialRunStatus={effectiveRunStatus(chat)}
      tickers={tickers}
      configured={agentConfigured()}
      transparency={transparency}
      related={related}
      pinTargets={pinTargets}
    />
  );
}
