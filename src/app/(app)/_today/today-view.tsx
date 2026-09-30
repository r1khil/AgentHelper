import { Suspense } from "react";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { holdings, teams, type Team } from "@/db/schema";
import { canManageTeam, isFundWide, type CurrentUser } from "@/lib/auth";
import { agentConfigured } from "@/lib/agent/model";
import { liveScopeFor, loadLiveSnapshot } from "@/lib/attribution/live-load";
import type { LiveSnapshot } from "@/lib/attribution/live";
import { marketSnapshot, type MarketSnapshot } from "@/lib/market";
import { fmtBp, fmtChangePct, fmtDayMonth } from "@/lib/format";
import { todayNY } from "@/lib/providers/calendar";
import { greetingWord, marketLine, weekdayName } from "@/lib/today";
import { EmptyState } from "@/components/app/empty-state";
import { AskComposer, AskQuestions, type AskScope } from "@/components/app/agent/ask-composer";
import { NoPageHead } from "@/components/app/page-head";
import { HomeGreeting, HomeTopLine } from "./greeting";

/** Questions under "Ask about today". */
const QUESTIONS = 3;
const ASK_LABEL = "Ask about today";

const LEARNING_BOUNDARY = "Hoot finds and cites the evidence. The analysis stays yours.";

/**
 * Home: a place to ask. The market's state in the top corner, Hoot's face and the greeting, one sentence on the book,
 * then the ask card with questions about today. Nothing else: what needs the reader is the bell's, what moves the book
 * and the last session are Portfolio's, the week ahead is Markets', and earlier threads are in the sidebar. The book
 * sentence (position P&L) is the whole fund for execs and admins, a lead's own team, and nothing for everyone else.
 */
export async function TodayView({ user, myTeams }: { user: CurrentUser; myTeams: Team[] }) {
  const firstName = user.fullName.split(" ")[0] || user.fullName;
  const now = new Date();
  if (myTeams.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-5 pt-10">
        <NoPageHead />
        <h1 className="text-center font-serif text-hero font-normal tracking-[-0.01em]">
          Good {greetingWord(now).toLowerCase()}, {firstName}.
        </h1>
        <EmptyState title="You are not on a team yet" hoot="wave">
          Ask a Fund admin to assign you to a sector team.
        </EmptyState>
      </div>
    );
  }

  const fundWide = isFundWide(user);
  const ownTeam = myTeams.find((t) => t.id === user.teamId) ?? null;
  // Position P&L: the whole fund for fund-wide roles, a lead's own team, nothing for everyone else.
  const bookTeam = !fundWide && ownTeam && canManageTeam(user, ownTeam.id) ? ownTeam : null;
  const activeHoldings = await db
    .select({ ticker: holdings.ticker, thesis: holdings.thesis })
    .from(holdings)
    .innerJoin(teams, eq(teams.id, holdings.teamId))
    .where(and(inArray(holdings.teamId, myTeams.map((t) => t.id)), eq(holdings.status, "active")))
    .orderBy(asc(teams.sortOrder), asc(holdings.ticker));

  // Neither is awaited here: the greeting and the box render at once, and the sentence and the questions stream in.
  const market = marketSnapshot(activeHoldings.map((h) => h.ticker));
  const live: Promise<LiveSnapshot | null> | null =
    fundWide || bookTeam
      ? (async () => {
          const scope = await liveScopeFor(user, fundWide ? null : bookTeam!.slug);
          return scope ? loadLiveSnapshot(scope) : null;
        })().catch((e) => {
          console.error("[home] live snapshot failed", e);
          return null;
        })
      : null;

  const configured = agentConfigured();
  const scopes: AskScope[] = fundWide ? [{ label: "Whole fund", slug: null }, ...myTeams.map((t) => ({ label: t.name, slug: t.slug }))] : myTeams.map((t) => ({ label: t.name, slug: t.slug }));
  const askSlug = fundWide ? null : (ownTeam ?? myTeams[0]).slug;
  const thesisTicker = activeHoldings.find((h) => h.thesis?.trim())?.ticker ?? null;
  const today = todayNY();

  return (
    <>
      <NoPageHead />
      <div className="-mx-10 -mt-8">
        <HomeTopLine line={marketLine(now)} />
      </div>
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center pt-[70px] pb-16">
        <HomeGreeting
          hello={greetingWord(now)}
          name={firstName}
          lead={
            live && (
              <Suspense fallback={null}>
                <BookLine live={live} name={fundWide ? "The fund" : bookTeam!.name} today={today} />
              </Suspense>
            )
          }
        />
        <div className="mt-8 w-full">
          <AskComposer
            scopes={scopes}
            defaultScope={askSlug}
            placeholder="Ask about the book, a holding, a filing or the tape…"
            note="Looks in the book, the team Drive, SEC filings and the web"
            configured={configured}
            autoFocus
            questions={
              <Suspense fallback={<AskQuestions label={ASK_LABEL} prompts={starterChips({ live: null, mover: null, thesisTicker })} />}>
                <TodayQuestions live={live} market={market} thesisTicker={thesisTicker} />
              </Suspense>
            }
          />
        </div>
        {!configured && <p className="mt-2.5 text-center text-body font-medium text-caution-foreground">Hoot isn&rsquo;t set up yet: an admin needs to turn it on.</p>}
        <p className="mt-3 text-center text-caption text-muted-foreground">{LEARNING_BOUNDARY}</p>
      </div>
    </>
  );
}

/** The sentence under the greeting, from today's live numbers: "The fund is +0.39% today, 12 bp ahead of its benchmark." */
async function BookLine({ live, name, today }: { live: Promise<LiveSnapshot | null>; name: string; today: string }) {
  const s = await live;
  if (!s) return null;
  const ret = s.ret * 100;
  const diff = s.result.activeReturn === null ? null : Math.round(s.result.activeReturn * 10_000);
  const tone = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "text-foreground");
  const when = s.session === today ? "today" : `on ${weekdayName(s.session)}`;
  return (
    <>
      {name} {s.session === today ? "is" : "was"} <b className={`font-semibold ${tone(ret)}`}>{fmtChangePct(ret)}</b> {when}
      {diff === null ? "" : diff === 0 ? ", in line with its benchmark" : <>, <b className={`font-semibold ${tone(diff)}`}>{fmtBp(Math.abs(diff))}</b> {diff > 0 ? "ahead of" : "behind"} its benchmark</>}.
    </>
  );
}

/** The questions about today, made from what is happening: the book against its benchmark, the biggest mover, the week. */
function starterChips({ live, mover, thesisTicker }: { live: LiveSnapshot | null; mover: { ticker: string; date: string } | null; thesisTicker: string | null }) {
  const diff = live?.result.activeReturn ?? null;
  return [
    diff === null || diff === 0 ? "What moved the market today, and what touches our holdings?" : `Why are we ${diff > 0 ? "ahead of" : "behind"} the benchmark today?`,
    mover ? `Pull the news on ${mover.ticker}’s ${fmtDayMonth(mover.date)} move` : null,
    "What’s on the calendar that touches the book?",
    thesisTicker ? `What changed on ${thesisTicker} since the thesis?` : null,
  ]
    .filter((q): q is string => !!q)
    .slice(0, QUESTIONS);
}

/** "Ask about today" in the ask card, once today's numbers are in. */
async function TodayQuestions({ live, market, thesisTicker }: { live: Promise<LiveSnapshot | null> | null; market: Promise<MarketSnapshot>; thesisTicker: string | null }) {
  const s = live ? await live : null;
  let mover: { ticker: string; date: string } | null = null;
  if (s) {
    const top = [...s.holdings].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0];
    if (top) mover = { ticker: top.ticker, date: s.session };
  } else {
    const m = await market;
    const top = Object.entries(m.rows)
      .flatMap(([ticker, r]) => (r.quote?.changePct === undefined ? [] : [{ ticker, pct: r.quote.changePct }]))
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
    if (top) mover = { ticker: top.ticker, date: todayNY() };
  }
  return <AskQuestions label={ASK_LABEL} prompts={starterChips({ live: s, mover, thesisTicker })} />;
}
