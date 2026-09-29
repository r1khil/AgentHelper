import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { canOpenChat, isFundWide, listAccessibleTeams, requireUser, transparencyEnabled } from "@/lib/auth";
import { getTeam, rememberedScope } from "@/lib/teams";
import { holdingHref } from "@/lib/scope";
import { threadTitle } from "@/lib/thread-title";
import { effectiveRunStatus, getChat, loadMessages } from "@/lib/chats";
import { listTeamHoldings } from "@/lib/holdings";
import { agentConfigured } from "@/lib/agent/model";
import { chatNextQuestions } from "@/lib/agent/memory/store";
import { chatMessages, profiles } from "@/db/schema";
import { db } from "@/db/client";
import { ChatWorkspace } from "@/components/app/chat/chat-panel";
import { PinToBoard, type PinTarget } from "@/components/app/chat/pin-to-board";
import { DeleteThread } from "@/components/app/chat/delete-thread";
import { ShareButton } from "@/components/app/chat/share-button";
import { TraceToggle } from "@/components/app/chat/trace-toggle";
import { HoldingLogo } from "@/components/app/holding-logo";
import type { Crumb } from "@/components/app/page-head";

// One read per request, shared by the title and the page.
const loadChat = cache(getChat);

export async function generateMetadata({ params }: { params: Promise<{ chatId: string }> }): Promise<Metadata> {
  const { chatId } = await params;
  const [user, chat] = await Promise.all([requireUser(), loadChat(chatId)]);
  // A chat this member can't open gets no title of its own (the page 404s).
  return { title: chat && canOpenChat(user, chat) ? threadTitle(chat.title) : "Thread" };
}

/**
 * A thread with Hoot: every chat opens here, a general one and one pinned to a holding alike. It lives outside
 * /t/<team> on purpose: the team it is filed under is bookkeeping, so opening it never changes the scope in the sidebar
 * and changing the scope never closes it. A holding's thread names the holding in its header and links back to it.
 */
export default async function HootChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const user = await requireUser();
  const chat = await loadChat(chatId);
  if (!chat || !canOpenChat(user, chat)) notFound();
  // A fund-wide conversation (no team) belongs to the whole Fund: every team's holdings are its tickers.
  const team = chat.teamId ? await getTeam(chat.teamId) : null;
  if (chat.teamId && !team) notFound();
  const [remembered, accessible] = await Promise.all([rememberedScope(user), listAccessibleTeams(user)]);
  const holdings = await listTeamHoldings(team ? team.id : accessible.map((t) => t.id), "all");
  const pinned = team && chat.holdingId ? (holdings.find(({ h }) => h.id === chat.holdingId)?.h ?? null) : null;
  const fundWide = isFundWide(user);
  const [messages, times, related, [author], pinnable] = await Promise.all([
    loadMessages(chat.id),
    db
      .select({ id: chatMessages.id, createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(eq(chatMessages.chatId, chat.id))
      .then((rows) => Object.fromEntries(rows.map((r) => [r.id, r.createdAt.toISOString()]))),
    chatNextQuestions(chat.id).catch(() => []),
    chat.createdBy ? db.select({ name: profiles.fullName }).from(profiles).where(eq(profiles.id, chat.createdBy)).limit(1) : Promise.resolve([]),
    // The holdings a general conversation can be pinned to: any team's for execs and admins, the team's own otherwise.
    pinned ? Promise.resolve([]) : listTeamHoldings(fundWide || !team ? accessible.map((t) => t.id) : team.id),
  ]);
  // A holding's thread is about that holding; a general one can turn to any of the scope's active holdings.
  const tickers = pinned ? [pinned.ticker] : holdings.filter(({ h }) => h.status === "active").map(({ h }) => h.ticker);
  const teamById = new Map(accessible.map((t) => [t.id, t]));
  const pinTargets: PinTarget[] = pinnable.flatMap(({ h }) => {
    const t = teamById.get(h.teamId);
    return t ? [{ ticker: h.ticker, company: h.companyName, teamSlug: t.slug, team: t.name }] : [];
  });
  const transparency = transparencyEnabled(user);
  // The holding opens in the scope the member is in when that scope shows it (the fund shows every team's).
  const crumbs: Crumb[] =
    team && pinned
      ? [
          {
            label: (
              <span className="inline-flex items-center gap-2">
                <HoldingLogo ticker={pinned.ticker} size={20} />
                {pinned.ticker}
              </span>
            ),
            href: holdingHref(remembered, team.slug, pinned.ticker),
          },
        ]
      : [{ label: team?.name ?? "Whole fund" }];

  return (
    <ChatWorkspace
      title={chat.title}
      ticker={pinned?.ticker ?? null}
      crumbs={crumbs}
      teamSlug={team?.slug ?? null}
      author={author?.name ?? (chat.createdBy === user.id ? user.fullName : null)}
      updatedAt={chat.updatedAt.toISOString()}
      actions={
        <>
          {fundWide && <TraceToggle on={transparency} />}
          {pinTargets.length > 0 && <PinToBoard chatId={chat.id} targets={pinTargets} look="header" />}
          <DeleteThread chatId={chat.id} />
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
      times={times}
    />
  );
}
