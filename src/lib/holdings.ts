import "server-only";
import { and, asc, count, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { earnings, holdingNotes, holdingProposals, holdings, modelProposals, models, movements, profiles } from "@/db/schema";
import { inTeams, type TeamIds } from "@/lib/team-filter";

export async function listTeamHoldings(teamId: TeamIds, status: "active" | "exited" | "all" = "active") {
  const where = status === "all" ? inTeams(holdings.teamId, teamId) : and(inTeams(holdings.teamId, teamId), eq(holdings.status, status));
  return db
    .select({ h: holdings, ownerName: profiles.fullName })
    .from(holdings)
    .leftJoin(profiles, eq(profiles.id, holdings.ownerId))
    .where(where)
    .orderBy(asc(holdings.ticker));
}

export async function getHolding(teamId: string, ticker: string) {
  const [row] = await db
    .select({ h: holdings, ownerName: profiles.fullName })
    .from(holdings)
    .leftJoin(profiles, eq(profiles.id, holdings.ownerId))
    .where(and(eq(holdings.teamId, teamId), eq(holdings.ticker, ticker.toUpperCase())))
    .orderBy(desc(holdings.status)) // active first if an exited duplicate exists
    .limit(1);
  return row ?? null;
}

export async function listNotes(holdingId: string) {
  return db
    .select({ n: holdingNotes, authorName: profiles.fullName })
    .from(holdingNotes)
    .leftJoin(profiles, eq(profiles.id, holdingNotes.authorId))
    .where(eq(holdingNotes.holdingId, holdingId))
    .orderBy(desc(holdingNotes.createdAt));
}

/** App-extracted values awaiting an analyst's decision (one pending per field). */
export async function listPendingProposals(holdingId: string) {
  return db
    .select()
    .from(holdingProposals)
    .where(and(eq(holdingProposals.holdingId, holdingId), eq(holdingProposals.status, "pending")))
    .orderBy(desc(holdingProposals.createdAt));
}

export async function listTeamMembers(teamId: string) {
  return db.select().from(profiles).where(eq(profiles.teamId, teamId)).orderBy(asc(profiles.fullName));
}

/**
 * The last `n` stored daily closes per ticker, oldest first, in one query: the Holdings list's 5-day sparklines.
 * Only looks back a month, so a ticker whose history has gone stale simply gets no line.
 */
export async function listRecentCloses(tickers: string[], n = 6): Promise<Map<string, number[]>> {
  const list = [...new Set(tickers)];
  if (!list.length) return new Map();
  const rows = await db.execute<{ ticker: string; close: string }>(sql`
    select ticker, close from (
      select ticker, session_date, close, row_number() over (partition by ticker order by session_date desc) as rn
      from daily_closes
      where ticker in (${sql.join(list.map((t) => sql`${t}`), sql`, `)}) and session_date >= current_date - 31
    ) recent
    where rn <= ${n}
    order by ticker, session_date
  `);
  const out = new Map<string, number[]>();
  for (const r of rows) {
    const v = Number(r.close);
    if (!Number.isFinite(v)) continue;
    const arr = out.get(r.ticker) ?? [];
    arr.push(v);
    out.set(r.ticker, arr);
  }
  return out;
}

/** What each holding has waiting on it, for the Holdings list's "Needs attention" column and filter chips. */
export type HoldingSignals = {
  /** The newest unfinished movement write-up. */
  openMovement: { id: string; sessionDate: string; dueAt: Date | null } | null;
  /** The soonest upcoming report on or after `today`. */
  nextReport: { id: string; reportDate: string; reportHour: string | null; estimated: boolean; locked: boolean } | null;
  /** Model values waiting for an analyst to approve or reject. */
  modelUpdates: number;
  /** A thesis the app extracted that nobody has accepted or dismissed yet. */
  thesisProposed: boolean;
};

/** Small indexed queries in parallel: open movements, upcoming reports, pending model values and thesis proposals. */
export async function listHoldingSignals(holdingIds: string[], today: string): Promise<Map<string, HoldingSignals>> {
  const out = new Map<string, HoldingSignals>();
  if (!holdingIds.length) return out;
  const [moves, reports, modelRows, thesisRows] = await Promise.all([
    db
      .select({ id: movements.id, holdingId: movements.holdingId, sessionDate: movements.sessionDate, dueAt: movements.dueAt })
      .from(movements)
      .where(and(inArray(movements.holdingId, holdingIds), ne(movements.status, "completed")))
      .orderBy(desc(movements.sessionDate)),
    db
      .select({ id: earnings.id, holdingId: earnings.holdingId, reportDate: earnings.reportDate, reportHour: earnings.reportHour, dateStatus: earnings.dateStatus, preLockedAt: earnings.preLockedAt })
      .from(earnings)
      .where(and(inArray(earnings.holdingId, holdingIds), eq(earnings.status, "upcoming"), gte(earnings.reportDate, today)))
      .orderBy(asc(earnings.reportDate)),
    db
      .select({ holdingId: models.holdingId, n: count() })
      .from(modelProposals)
      .innerJoin(models, eq(models.id, modelProposals.modelId))
      .where(and(inArray(models.holdingId, holdingIds), eq(modelProposals.status, "proposed")))
      .groupBy(models.holdingId),
    db
      .select({ holdingId: holdingProposals.holdingId })
      .from(holdingProposals)
      .where(and(inArray(holdingProposals.holdingId, holdingIds), eq(holdingProposals.status, "pending"))),
  ]);
  const get = (id: string) => {
    let s = out.get(id);
    if (!s) out.set(id, (s = { openMovement: null, nextReport: null, modelUpdates: 0, thesisProposed: false }));
    return s;
  };
  for (const m of moves) {
    const s = get(m.holdingId);
    if (!s.openMovement) s.openMovement = { id: m.id, sessionDate: m.sessionDate, dueAt: m.dueAt };
  }
  for (const r of reports) {
    const s = get(r.holdingId);
    if (!s.nextReport) s.nextReport = { id: r.id, reportDate: r.reportDate, reportHour: r.reportHour, estimated: r.dateStatus === "estimated", locked: !!r.preLockedAt };
  }
  for (const r of modelRows) get(r.holdingId).modelUpdates = Number(r.n);
  for (const r of thesisRows) get(r.holdingId).thesisProposed = true;
  return out;
}

/** One holding's earnings (newest first), movements and uploaded models, for the holding page's glance list and tabs. */
export async function loadHoldingActivity(holdingId: string) {
  const [reports, moves, modelRows] = await Promise.all([
    db.select().from(earnings).where(eq(earnings.holdingId, holdingId)).orderBy(desc(earnings.reportDate)).limit(24),
    db
      .select({ id: movements.id, sessionDate: movements.sessionDate, status: movements.status, dueAt: movements.dueAt, relativeMovePp: movements.relativeMovePp })
      .from(movements)
      .where(eq(movements.holdingId, holdingId))
      .orderBy(desc(movements.sessionDate))
      .limit(20),
    db
      .select({
        id: models.id,
        version: models.version,
        fileName: models.fileName,
        createdAt: models.createdAt,
        uploader: profiles.fullName,
        pending: sql<number>`(select count(*) from model_proposals p where p.model_id = ${models.id} and p.status = 'proposed')`.mapWith(Number),
      })
      .from(models)
      .leftJoin(profiles, eq(profiles.id, models.uploadedBy))
      .where(eq(models.holdingId, holdingId))
      .orderBy(desc(models.version))
      .limit(10),
  ]);
  return { reports, moves, models: modelRows };
}
