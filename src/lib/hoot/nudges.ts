import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { changelogEntries, earnings, holdingProposals, holdings, modelProposals, models, movements, profiles, sellSideCalls, teams } from "@/db/schema";
import { canManageTeam, isFundWide, listAccessibleTeams, type CurrentUser } from "@/lib/auth";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
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
  const managed = teamList.filter((t) => canManageTeam(user, t.id)).map((t) => t.id);
  const fundWide = isFundWide(user);
  const dismissed = user.hoot?.dismissed ?? {};
  const none = Promise.resolve([] as never[]);

  // Holdings filtered to the unowned ones, across the fund or the one team a lead runs.
  const unownedHref = `/t/${fundWide ? FUND_SCOPE_SLUG : teamList.find((t) => t.id === managed[0])?.slug}?filter=unassigned`;

  const [myMovements, teamMovements, unowned, upcoming, mySellSide, thesis, modelRows, weekly, changelog] = await Promise.all([
    db
      .select({ id: movements.id, ticker: holdings.ticker, teamSlug: teams.slug, dueAt: movements.dueAt })
      .from(movements)
      .innerJoin(holdings, eq(holdings.id, movements.holdingId))
      .innerJoin(teams, eq(teams.id, holdings.teamId))
      .where(and(eq(movements.ownerId, user.id), ne(movements.status, "completed")))
      .limit(10),
    managed.length
      ? db
          .select({ id: movements.id, ticker: holdings.ticker, teamSlug: teams.slug, dueAt: movements.dueAt, ownerName: profiles.fullName })
          .from(movements)
          .innerJoin(holdings, eq(holdings.id, movements.holdingId))
          .innerJoin(teams, eq(teams.id, holdings.teamId))
          .leftJoin(profiles, eq(profiles.id, movements.ownerId))
          .where(and(inArray(holdings.teamId, managed), ne(movements.status, "completed"), or(isNull(movements.ownerId), and(ne(movements.ownerId, user.id), lt(movements.dueAt, now)))))
          .orderBy(asc(movements.dueAt))
          .limit(20)
      : none,
    managed.length
      ? db
          .select({ count: count() })
          .from(holdings)
          .where(and(inArray(holdings.teamId, managed), eq(holdings.status, "active"), isNull(holdings.ownerId)))
      : none,
    teamIds.length
      ? db
          .select({ e: earnings, ticker: holdings.ticker, ownerId: holdings.ownerId, teamSlug: teams.slug })
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
    unownedHoldings: unowned[0]?.count ? { count: unowned[0].count, href: unownedHref } : null,
    earnings: upcoming.map((r) => ({ id: r.e.id, ticker: r.ticker, teamSlug: r.teamSlug, reportDate: r.e.reportDate, reportHour: r.e.reportHour, expectationsLocked: !!r.e.preLockedAt, mine: r.ownerId === user.id })),
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
