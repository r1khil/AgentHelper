import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { backtestScenarios, profiles, type BacktestScenario } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { isFundWide } from "@/lib/roles";
import type { Snapshot } from "./engine";

/** Fund-wide members share the Fund's scenarios; everyone else shares their team's. */
const scopeOf = (user: CurrentUser) => (isFundWide(user) ? null : user.teamId);
const inScope = (user: CurrentUser) => {
  const team = scopeOf(user);
  return team ? eq(backtestScenarios.teamId, team) : isNull(backtestScenarios.teamId);
};

export type SavedScenarioSummary = { id: string; name: string; note: string | null; createdAt: string; createdBy: string | null; createdById: string | null; from: string; to: string; benchmark: string; changes: number };

export async function listScenarios(user: CurrentUser, limit = 20): Promise<SavedScenarioSummary[]> {
  const rows = await db
    .select({ s: backtestScenarios, author: profiles.fullName })
    .from(backtestScenarios)
    .leftJoin(profiles, eq(profiles.id, backtestScenarios.createdBy))
    .where(inScope(user))
    .orderBy(desc(backtestScenarios.createdAt))
    .limit(limit);
  return rows.map(({ s, author }) => ({
    id: s.id,
    name: s.name,
    note: s.note,
    createdAt: s.createdAt.toISOString(),
    createdBy: author,
    createdById: s.createdBy,
    from: s.fromDate,
    to: s.toDate,
    benchmark: s.benchmark,
    changes: Object.keys(s.weights).filter((t) => Math.abs((s.weights[t] ?? 0) - (s.baseWeights[t] ?? 0)) > 1e-6).length + s.added.length,
  }));
}

export async function getScenario(user: CurrentUser, id: string): Promise<(BacktestScenario & { author: string | null }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({ s: backtestScenarios, author: profiles.fullName })
    .from(backtestScenarios)
    .leftJoin(profiles, eq(profiles.id, backtestScenarios.createdBy))
    .where(and(eq(backtestScenarios.id, id), inScope(user)))
    .limit(1);
  return row ? { ...row.s, author: row.author } : null;
}

export async function saveScenario(
  user: CurrentUser,
  snapshot: Snapshot,
  input: { name: string; note?: string; weights: Record<string, number>; added: { ticker: string; name: string }[]; from: string; to: string; benchmark: string },
) {
  const byId = new Map(snapshot.positions.map((p) => [p.id, p]));
  const pct = (w: number) => Math.round(w * 1e6) / 1e4;
  const weights: Record<string, number> = {};
  for (const [id, w] of Object.entries(input.weights)) {
    const ticker = byId.get(id)?.ticker ?? (id.startsWith("added:") ? id.slice(6) : null);
    if (ticker) weights[ticker] = pct(w);
  }
  const baseWeights = Object.fromEntries(snapshot.positions.filter((p) => p.kind !== "scenario").map((p) => [p.ticker, pct(p.weight)]));
  const [row] = await db
    .insert(backtestScenarios)
    .values({
      name: input.name,
      note: input.note || null,
      teamId: scopeOf(user),
      createdBy: user.id,
      baseVersion: snapshot.version,
      weights,
      baseWeights,
      added: input.added,
      fromDate: input.from,
      toDate: input.to,
      benchmark: input.benchmark,
    })
    .returning({ id: backtestScenarios.id });
  return row.id;
}

/** Only the author or an exec/admin removes a saved scenario. */
export async function deleteScenario(user: CurrentUser, id: string) {
  const s = await getScenario(user, id);
  if (!s) return false;
  if (s.createdBy !== user.id && !isFundWide(user)) throw new Error("Only the person who saved this scenario can remove it.");
  await db.delete(backtestScenarios).where(eq(backtestScenarios.id, id));
  return true;
}

/**
 * Map a saved scenario's ticker weights onto today's snapshot. Tickers no longer held are dropped and
 * reported; holdings added since keep their saved weights. The result may not total 100%, in which
 * case the page asks the member to fix it before running.
 */
export function scenarioOntoSnapshot(snapshot: Snapshot, s: Pick<BacktestScenario, "weights" | "baseVersion" | "added">) {
  const current = new Set(snapshot.positions.map((p) => p.ticker));
  const added = new Set(s.added.map((a) => a.ticker));
  const dropped = Object.keys(s.weights).filter((t) => !current.has(t) && !added.has(t) && (s.weights[t] ?? 0) > 0);
  const newSince = snapshot.positions.filter((p) => p.kind !== "cash" && !(p.ticker in s.weights)).map((p) => p.ticker);
  return { weightsPct: s.weights, changedSince: s.baseVersion !== snapshot.version, dropped, newSince };
}
