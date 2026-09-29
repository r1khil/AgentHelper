import "server-only";
import { and, asc, count, eq, gte, inArray, ne } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "@/db/client";
import { earnings, holdings, modelProposals, models, movements, sellSideCalls } from "@/db/schema";
import { canManageTeam, isFundWide, listAccessibleTeams, type CurrentUser } from "@/lib/auth";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { todayNY } from "@/lib/providers/calendar";
import { latestPackStatus } from "@/lib/weekly/latest";
import { listGeneralChats, listRecentHoldingChats } from "@/lib/chats";
import { boardHref } from "@/lib/scope";
import { PACK_STATUS_LABELS } from "@/lib/weekly/status";

/** A count on a header tab. `hot` means something needs action (pink); otherwise it's a plain count. */
export type TabCount = { value: string; hot?: boolean };

export type CommandHolding = {
  ticker: string;
  company: string;
  team: string;
  teamSlug: string;
  weightPct: number | null;
  nextReport: string | null;
  nextReportEstimated: boolean;
  openMovement: boolean;
};

/** A sidebar badge in words: "1 overdue" (red), "4 to decide" (grey). */
export type NavBadge = { label: string; hot?: boolean };

/** A recent Hoot chat, for ⌘J's "Recent answers". */
export type RecentChat = { title: string; href: string; at: string };

export type NavData = { counts: Record<string, TabCount>; badges: Partial<Record<"movements" | "models", NavBadge>>; holdings: CommandHolding[]; recent: RecentChat[] };

/**
 * The header's tab counts and the ⌘K holding list for one scope. Small indexed queries in parallel; the member
 * only ever sees teams they can access, whatever scope the URL asks for.
 */
export async function loadNavData(user: CurrentUser, scope: string): Promise<NavData> {
  const accessible = await listAccessibleTeams(user);
  const fund = scope === FUND_SCOPE_SLUG && isFundWide(user);
  const inScope = fund ? accessible : accessible.filter((t) => t.slug === scope);
  const teamIds = inScope.map((t) => t.id);
  if (!teamIds.length) return { counts: {}, badges: {}, holdings: [], recent: [] };
  const today = todayNY();
  const lastWeek = DateTime.now().minus({ days: 7 }).toJSDate();

  const viewer = { fundWide: isFundWide(user) };
  const [rows, openMoves, proposals, calls, reports, weekly, general, pinned] = await Promise.all([
    db
      .select({ ticker: holdings.ticker, company: holdings.companyName, teamId: holdings.teamId, weightPct: holdings.weightPct })
      .from(holdings)
      .where(and(inArray(holdings.teamId, teamIds), eq(holdings.status, "active")))
      .orderBy(asc(holdings.ticker)),
    db
      .select({ ticker: holdings.ticker, dueAt: movements.dueAt })
      .from(movements)
      .innerJoin(holdings, eq(holdings.id, movements.holdingId))
      .where(and(inArray(holdings.teamId, teamIds), ne(movements.status, "completed"))),
    db
      .select({ n: count() })
      .from(modelProposals)
      .innerJoin(models, eq(models.id, modelProposals.modelId))
      .innerJoin(holdings, eq(holdings.id, models.holdingId))
      .where(and(inArray(holdings.teamId, teamIds), eq(modelProposals.status, "proposed"))),
    // The member's own calls whose brief just landed or that need a retry.
    db
      .select({ n: count() })
      .from(sellSideCalls)
      .where(and(inArray(sellSideCalls.teamId, teamIds), eq(sellSideCalls.createdBy, user.id), inArray(sellSideCalls.status, ["ready", "error"]), gte(sellSideCalls.updatedAt, lastWeek))),
    db
      .select({ ticker: holdings.ticker, reportDate: earnings.reportDate, dateStatus: earnings.dateStatus })
      .from(earnings)
      .innerJoin(holdings, eq(holdings.id, earnings.holdingId))
      .where(and(inArray(holdings.teamId, teamIds), eq(earnings.status, "upcoming"), gte(earnings.reportDate, today)))
      .orderBy(asc(earnings.reportDate)),
    isFundWide(user) ? latestPackStatus() : Promise.resolve(null),
    listGeneralChats(teamIds, viewer, 3),
    listRecentHoldingChats(teamIds, viewer, 3),
  ]);
  const recent: RecentChat[] = [
    ...general.map((g) => ({ title: g.c.title, href: `/hoot/${g.c.id}`, at: g.c.updatedAt.toISOString() })),
    ...pinned.map((p) => ({ title: p.c.title, href: boardHref(scope, p.teamSlug, p.ticker, p.c.id), at: p.c.updatedAt.toISOString() })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 3);

  const teamById = new Map(inScope.map((t) => [t.id, t]));
  const next = new Map<string, { date: string; estimated: boolean }>();
  for (const r of reports) if (!next.has(r.ticker)) next.set(r.ticker, { date: r.reportDate, estimated: r.dateStatus === "estimated" });
  const moving = new Set(openMoves.map((m) => m.ticker));
  const overdueCount = openMoves.filter((m) => m.dueAt && m.dueAt.getTime() < Date.now()).length;
  const overdue = overdueCount > 0;

  const counts: Record<string, TabCount> = {};
  counts.holdings = { value: String(rows.length) };
  if (openMoves.length) counts.movements = { value: String(openMoves.length), hot: overdue };
  if (proposals[0]?.n) counts.models = { value: String(proposals[0].n) };
  if (calls[0]?.n) counts["sell-side"] = { value: String(calls[0].n), hot: true };
  // The newest pack's status, in the words the Weekly page uses; nothing once it is Sent.
  if (weekly && weekly.state !== "sent") counts.weekly = { value: PACK_STATUS_LABELS[weekly.state], hot: true };

  const badges: NavData["badges"] = {};
  if (overdueCount) badges.movements = { label: `${overdueCount} overdue`, hot: true };
  else if (openMoves.length) badges.movements = { label: `${openMoves.length} open` };
  if (proposals[0]?.n) badges.models = { label: `${proposals[0].n} to decide` };

  return {
    counts,
    badges,
    recent,
    holdings: rows.map((r) => {
      const t = teamById.get(r.teamId);
      const n = next.get(r.ticker);
      return {
        ticker: r.ticker,
        company: r.company,
        team: t?.name ?? "",
        teamSlug: t?.slug ?? scope,
        // Position sizes are for execs, admins and the team's leads (docs/PRODUCT.md, Access).
        weightPct: r.weightPct == null || !(isFundWide(user) || canManageTeam(user, r.teamId)) ? null : Number(r.weightPct),
        nextReport: n?.date ?? null,
        nextReportEstimated: n?.estimated ?? false,
        openMovement: moving.has(r.ticker),
      };
    }),
  };
}

