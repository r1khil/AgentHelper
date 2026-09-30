import "server-only";
import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { changelogEntries, earnings, holdingProposals, holdings, modelProposals, models, sellSideCalls, teams, type Team } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { canManageTeam, isFundWide } from "@/lib/roles";
import { isTradingDay, nextTradingDay, NY, todayNY } from "@/lib/providers/calendar";
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

/**
 * What Hoot knows about right now for this member. Small indexed queries, run in parallel. Free of request APIs so
 * Hoot's to-do tool can call it too: the caller passes the teams the member can see and the scope links open in.
 */
export async function loadHootFeedFor(user: CurrentUser, { teamList, scope }: { teamList: Team[]; scope: string | null }): Promise<HootFeed> {
  const now = new Date();
  const today = todayNY();
  // The next four trading days: "this week" without counting weekends and holidays.
  const soon: string[] = [];
  let d = today;
  while (soon.length < 4) {
    d = nextTradingDay(d);
    soon.push(d);
  }
  const teamIds = teamList.map((t) => t.id);
  const ownTeamId = user.teamId;
  const managed = teamList.filter((t) => canManageTeam(user, t.id)).map((t) => t.id);
  const fundWide = isFundWide(user);
  const dismissed = user.hoot?.dismissed ?? {};
  const none = Promise.resolve([] as never[]);

  const [upcoming, mySellSide, thesis, modelRows, weekly, changelog] = await Promise.all([
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
    scope,
    now,
    today,
    soon,
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
