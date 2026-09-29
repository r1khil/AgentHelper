import "server-only";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles, sellSideParts, type Team } from "@/db/schema";
import { listTeamHoldings } from "@/lib/holdings";
import { listCalls } from "@/lib/sell-side/store";
import { getChat, loadMessages, effectiveRunStatus } from "@/lib/chats";
import { agentConfigured } from "@/lib/agent/model";
import { canOpenChat, transparencyEnabled, type CurrentUser } from "@/lib/auth";
import type { TeamIds } from "@/lib/team-filter";
import { holdingHref, sellSideHref } from "@/lib/scope";
import { HootMoodFor } from "@/components/app/hoot/presence";
import { RecordACall, type CallTeam } from "@/components/app/sell-side/new-call";
import { CallWorkspace } from "@/components/app/sell-side/call-workspace";
import { AnalysisBrief } from "@/components/app/sell-side/analysis-brief";
import { CallDiscussion } from "@/components/app/sell-side/call-discussion";
import { PickACall, SellSideLayout, type SavedCallRow } from "@/components/app/sell-side/sell-side-layout";
import { listStatus, minutesLabel } from "@/components/app/sell-side/timeline";
import { fmtDay, fmtDayMonth } from "@/lib/format";

type Call = Awaited<ReturnType<typeof listCalls>>[number];
export type SellSideScope = { slug: string; team: Team | null; teamIds: TeamIds; teamById: Map<string, Team>; user: CurrentUser };


/** Who recorded each call and how far its saved audio has got, for the saved-calls rows and the call's meta line. */
async function callFacts(calls: Call[]) {
  const ids = calls.map((c) => c.id);
  const creators = [...new Set(calls.map((c) => c.createdBy).filter((id): id is string => !!id))];
  const [parts, people] = await Promise.all([
    ids.length
      ? db
          .select({
            callId: sellSideParts.callId,
            parts: sql<number>`count(*)::int`,
            transcribed: sql<number>`count(${sellSideParts.segments})::int`,
            spoken: sql<number>`(count(*) filter (where ${sellSideParts.segments} <> '[]'::jsonb))::int`,
            summarized: sql<number>`count(${sellSideParts.summary})::int`,
            seconds: sql<string>`coalesce(sum(${sellSideParts.duration}), 0)`,
          })
          .from(sellSideParts)
          .where(inArray(sellSideParts.callId, ids))
          .groupBy(sellSideParts.callId)
      : [],
    creators.length ? db.select({ id: profiles.id, name: profiles.fullName }).from(profiles).where(inArray(profiles.id, creators)) : [],
  ]);
  const counts = new Map(
    parts.map((p) => [p.callId, { parts: p.parts, transcribed: p.transcribed, spoken: p.spoken, summarized: p.summarized, seconds: Number(p.seconds) }]),
  );
  const names = new Map(people.map((p) => [p.id, p.name]));
  return {
    counts: (id: string) => counts.get(id) ?? { parts: 0, transcribed: 0, spoken: 0, summarized: 0, seconds: 0 },
    name: (c: Call) => (c.createdBy ? names.get(c.createdBy) : undefined),
  };
}

/**
 * Sell-side calls. Both routes render this: the list route (every call in the scope, reached from a holding's Filings &
 * notes tab) selects the most recent call; the call route selects its call, which belongs to its holding when it is
 * about one (Portfolio / TICKER / the call).
 */
export async function SellSideScreen({ scope, call }: { scope: SellSideScope; call?: Call }) {
  const { team, teamIds, teamById, user } = scope;
  const [calls, holdings] = await Promise.all([listCalls(teamIds), listTeamHoldings(teamIds)]);
  const selected = call ?? calls[0] ?? null;
  const facts = await callFacts(selected && !calls.some((c) => c.id === selected.id) ? [...calls, selected] : calls);
  const rows: SavedCallRow[] = calls.map((c) => {
    const counts = facts.counts(c.id);
    return {
      id: c.id,
      href: sellSideHref(scope.slug, teamById.get(c.teamId)?.slug ?? scope.slug, c.id),
      ticker: c.ticker,
      title: c.title,
      when: fmtDayMonth(c.createdAt),
      status: listStatus(c, counts),
      detail: [facts.name(c), fmtDay(c.createdAt), counts.seconds > 0 ? minutesLabel(counts.seconds) : null, !team ? teamById.get(c.teamId)?.name : null].filter(Boolean).join(", "),
    };
  });
  // Who a new call can be for: the team in view, or any team in the fund's view.
  const callTeams: CallTeam[] = [...teamById.values()].map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    holdings: holdings.filter(({ h }) => h.teamId === t.id).map(({ h }) => ({ id: h.id, ticker: h.ticker, companyName: h.companyName })),
  }));
  const portfolio = { label: "Portfolio", href: `/t/${scope.slug}` };
  const listCrumb = { label: "Sell-side calls", href: `/t/${scope.slug}/sell-side` };
  const ownerSlug = call ? (teamById.get(call.teamId)?.slug ?? scope.slug) : scope.slug;
  const crumbs = !call
    ? [portfolio, { label: "Sell-side calls" }]
    : call.holdingId
      ? [portfolio, { label: call.ticker, href: holdingHref(scope.slug, ownerSlug, call.ticker, "?tab=filings") }, { label: call.title }]
      : // A call about a company the fund doesn't hold has no holding page to belong to.
        [portfolio, listCrumb, { label: `${call.ticker}, ${call.title}` }];
  return (
    <SellSideLayout
      crumbs={crumbs}
      record={team ? <RecordACall team={team.slug} teamId={team.id} holdings={callTeams[0]?.holdings ?? []} /> : <RecordACall teams={callTeams} scope={scope.slug} />}
      calls={rows}
      selectedId={selected?.id ?? null}
      heading={`${team ? team.name : "Whole fund"}, ${calls.length} call${calls.length === 1 ? "" : "s"}`}
      empty={`${team ? "Your team’s" : "Every team’s"} calls, summaries, transcripts, and follow-up chats will appear here.`}
    >
      {selected ? (
        <CallPane
          call={selected}
          user={user}
          by={facts.name(selected)}
          sector={teamById.get(selected.teamId)?.name}
          spoken={facts.counts(selected.id).spoken > 0}
        />
      ) : (
        <PickACall>{team ? "Record a call on the left. Its brief, transcript and saved chat open here." : "Calls from every team open here once one is recorded."}</PickACall>
      )}
    </SellSideLayout>
  );
}

async function CallPane({ call, user, by, sector, spoken }: { call: Call; user: CurrentUser; by?: string; sector?: string; spoken: boolean }) {
  const [chat, messages] = await Promise.all([getChat(call.chatId), loadMessages(call.chatId)]);
  if (!chat) return <PickACall>This call’s saved discussion could not be found.</PickACall>;
  // Once an exec's follow-up read the price target sheet, the discussion is for execs and admins only.
  const hidden = !canOpenChat(user, chat);
  const ready = call.status === "ready";
  const configured = agentConfigured();
  return (
    <>
      {ready && <HootMoodFor mood="happy" />}
      <CallWorkspace
        key={call.id}
        callId={call.id}
        configured={configured}
        header={{ ticker: call.ticker, title: call.title, sector, when: fmtDay(call.createdAt), by }}
        expect={{ timeline: spoken, recorder: !ready || !!call.error }}
        chat={
          ready && !hidden ? (
            <CallDiscussion
              embedded
              chatId={chat.id}
              initialMessages={messages}
              initialRunStatus={effectiveRunStatus(chat)}
              tickers={[call.ticker]}
              configured={configured}
              transparency={transparencyEnabled(user)}
            />
          ) : undefined
        }
      >
        {ready &&
          (hidden ? (
            <p className="px-5 py-4 text-body text-muted-foreground">
              The analysis and discussion for this call are visible to execs and admins only, because they draw on the price target sheet.
            </p>
          ) : (
            <AnalysisBrief chatId={chat.id} messages={messages} />
          ))}
      </CallWorkspace>
    </>
  );
}
