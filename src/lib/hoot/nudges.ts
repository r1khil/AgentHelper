import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { changelogEntries, earnings, holdingProposals, holdings, modelProposals, models, movements, sellSideCalls, teams } from "@/db/schema";
import { canManageTeam, isFundWide, listAccessibleTeams, type CurrentUser } from "@/lib/auth";
import { isTradingDay, nextTradingDay, NY, todayNY } from "@/lib/providers/calendar";
import { rememberedScope } from "@/lib/teams";
import { latestPackStatus } from "@/lib/weekly/latest";
import { buildNudges } from "./build";
import type { HootFeed } from "./types";

/** US regular session: 9:30–16:00 New York time on trading days. */
export function marketOpen(now: Date) {
  const t = DateTime.fromJSDate(now).setZone(NY);
  if (!isTradingDay(t.toISODate()!)) return false;
  const minutes = t.hour * 60 + t.minute;
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

/** What Hoot knows about right now for this member. Small indexed queries, run in parallel. */
export async function loadHootFeed(user: CurrentUser): Promise<HootFeed> {
  const now = new Date();
  const today = todayNY();
  // The next four trading days: "this week" without counting weekends and holidays.
  const soon: string[] = [];
  let d = today;
  while (soon.length < 4) {
    d = nextTradingDay(d);
    soon.push(d);
  }
  const teamList = await listAccessibleTeams(user);
  const teamIds = teamList.map((t) => t.id);
  // A write-up belongs to the whole team that holds the stock, so a member's own are their team's. Rows the close
  // check logged for a data problem aren't write-ups (no move was calculated); the reminder emails skip them too.
  const ownTeamId = user.teamId;
  // Other teams this member runs: a lead runs only their own; an exec or admin runs every team.
  const managedOthers = teamList.filter((t) => t.id !== ownTeamId && canManageTeam(user, t.id)).map((t) => t.id);
  const managed = teamList.filter((t) => canManageTeam(user, t.id)).map((t) => t.id);
  const fundWide = isFundWide(user);
  const dismissed = user.hoot?.dismissed ?? {};
  const none = Promise.resolve([] as never[]);

  const [myMovements, teamMovements, upcoming, mySellSide, thesis, modelRows, weekly, changelog] = await Promise.all([
    ownTeamId
      ? db
          .select({ id: movements.id, ticker: holdings.ticker, teamSlug: teams.slug, dueAt: movements.dueAt })
          .from(movements)
          .innerJoin(holdings, eq(holdings.id, movements.holdingId))
          .innerJoin(teams, eq(teams.id, holdings.teamId))
          .where(and(eq(holdings.teamId, ownTeamId), ne(movements.status, "completed"), isNull(movements.dataQuality)))
          .orderBy(asc(movements.dueAt))
          .limit(10)
      : none,
    managedOthers.length
      ? db
          .select({ id: movements.id, ticker: holdings.ticker, teamSlug: teams.slug, teamName: teams.name, dueAt: movements.dueAt })
          .from(movements)
          .innerJoin(holdings, eq(holdings.id, movements.holdingId))
          .innerJoin(teams, eq(teams.id, holdings.teamId))
          .where(and(inArray(holdings.teamId, managedOthers), ne(movements.status, "completed"), isNull(movements.dataQuality)))
          .orderBy(asc(movements.dueAt))
          .limit(20)
      : none,
    teamIds.length
      ? db
          .select({ e: earnings, ticker: holdings.ticker, teamId: holdings.teamId, teamSlug: teams.slug })
          .from(earnings)
          .innerJoin(holdings, eq(holdings.id, earnings.holdingId))
          .innerJoin(teams, eq(teams.id, holdings.teamId))
          .where(and(inArray(holdings.teamId, teamIds), eq(holdings.status, "active"), eq(earnings.status, "upcoming"), gte(earnings.reportDate, today), lte(earnings.reportDate, soon.at(-1)!)))
          .orderBy(earnings.reportDate)
          .limit(20)
      : none,
    db
      .select({ id: sellSideCalls.id, ticker: sellSideCalls.ticker, teamSlug: teams.slug, status: sellSideCalls.status, updatedAt: sellSideCalls.updatedAt })
      .from(sellSideCalls)
      .innerJoin(teams, eq(teams.id, sellSideCalls.teamId))
      .where(and(eq(sellSideCalls.createdBy, user.id), inArray(sellSideCalls.status, ["ready", "error"])))
      .orderBy(desc(sellSideCalls.updatedAt))
      .limit(5),
    managed.length
      ? db
          .select({ ticker: holdings.ticker, teamSlug: teams.slug })
          .from(holdingProposals)
          .innerJoin(holdings, eq(holdings.id, holdingProposals.holdingId))
          .innerJoin(teams, eq(teams.id, holdings.teamId))
          .where(and(inArray(holdings.teamId, managed), eq(holdingProposals.status, "pending")))
          .limit(10)
      : none,
    managed.length
      ? db
          .select({ modelId: models.id, ticker: holdings.ticker, teamSlug: teams.slug, count: count() })
          .from(modelProposals)
          .innerJoin(models, eq(models.id, modelProposals.modelId))
          .innerJoin(holdings, eq(holdings.id, models.holdingId))
          .innerJoin(teams, eq(teams.id, holdings.teamId))
          .where(and(inArray(holdings.teamId, managed), eq(modelProposals.status, "proposed")))
          .groupBy(models.id, holdings.ticker, teams.slug)
          .limit(5)
      : none,
    fundWide ? latestPackStatus() : Promise.resolve(null),
    fundWide
      ? db.select({ prNumber: changelogEntries.prNumber, headline: changelogEntries.headline, mergedAt: changelogEntries.mergedAt }).from(changelogEntries).orderBy(desc(changelogEntries.mergedAt)).limit(1)
      : none,
  ]);

  const nudges = buildNudges({
    // Links open in the scope the member is in when it shows the item, so a nudge doesn't switch scope.
    scope: await rememberedScope(user).catch(() => null),
    now,
    today,
    soon,
    myMovements,
    teamMovements,
    earnings: upcoming.map((r) => ({ id: r.e.id, ticker: r.ticker, teamSlug: r.teamSlug, reportDate: r.e.reportDate, reportHour: r.e.reportHour, expectationsLocked: !!r.e.preLockedAt, mine: !!ownTeamId && r.teamId === ownTeamId })),
    mySellSide,
    thesisProposals: thesis,
    modelProposals: modelRows,
    // Only this week's pack (Fri to Mon), and only until it is Sent.
    weeklyPack: weekly && weekly.state !== "sent" && weekly.weekEnding >= DateTime.fromISO(today).minus({ days: 3 }).toISODate()! ? { weekEnding: weekly.weekEnding, state: weekly.state } : null,
    latestChangelog: changelog[0] ?? null,
    dismissed,
  });
  const seenTips = Object.keys(dismissed).filter((k) => k.startsWith("tip:"));
  return { nudges, seenTips, marketOpen: marketOpen(now) };
}
