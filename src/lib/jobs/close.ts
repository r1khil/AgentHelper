import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { holdings, jobRuns, movementRuns, movements, teams } from "@/db/schema";
import { getDailyBars, SPX_SYMBOL } from "@/lib/providers/yahoo";
import { isTradingDay, movementDueAt, todayNY, formatNY } from "@/lib/providers/calendar";
import { qualifies, relativeMovePp, returnPct } from "@/lib/movement/math";
import { MOVEMENT_THRESHOLD_PP } from "@/lib/constants";
import { gatherMovementEvidence } from "./evidence";
import { queueNotification, sendPendingNotifications } from "./notify";
import { teamRecipients } from "./recipients";
import { upsertCloses } from "@/lib/prices";
import { createJobReporter } from "./progress";

export type CloseJobResult = {
  sessionDate: string;
  status: "ok" | "skipped" | "failed";
  reason?: string;
  tickers: number;
  qualified: string[];
  created: string[];
  dataQuality: Record<string, string>;
  evidencePending: number;
  notifications: number;
};

const BUDGET_MS = 240_000;

/**
 * The daily close check. Idempotent per session date: creating a movement twice is impossible
 * (unique index), and a completed run is not repeated unless `force` is set.
 */
export async function runCloseJob(opts: { sessionDate?: string; force?: boolean } = {}): Promise<CloseJobResult> {
  const started = Date.now();
  const sessionDate = opts.sessionDate ?? todayNY();
  const base: CloseJobResult = { sessionDate, status: "ok", tickers: 0, qualified: [], created: [], dataQuality: {}, evidencePending: 0, notifications: 0 };
  const [jobRow] = await db.insert(jobRuns).values({ job: "close", summary: { sessionDate } }).returning({ id: jobRuns.id });
  const progress = createJobReporter(jobRow.id);
  const finish = async (r: CloseJobResult) => {
    progress.step(r.status === "failed" ? "failed" : r.status === "skipped" ? "skipped" : "finished", r.reason ? { reason: r.reason } : undefined);
    await progress.close();
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: r.status !== "failed", summary: r as unknown as Record<string, unknown> }).where(eq(jobRuns.id, jobRow.id));
    await db
      .insert(movementRuns)
      .values({ sessionDate, status: r.status, summary: r as unknown as Record<string, unknown>, error: r.reason ?? null, finishedAt: new Date() })
      .onConflictDoUpdate({ target: movementRuns.sessionDate, set: { status: r.status, summary: r as unknown as Record<string, unknown>, error: r.reason ?? null, finishedAt: new Date(), startedAt: new Date() } });
    return r;
  };

  progress.step("check session", { sessionDate, force: Boolean(opts.force) });
  if (!isTradingDay(sessionDate)) return finish({ ...base, status: "skipped", reason: `${sessionDate} is not a trading day` });

  const [existing] = await db.select().from(movementRuns).where(eq(movementRuns.sessionDate, sessionDate)).limit(1);
  if (existing?.status === "ok" && !opts.force) {
    const r: CloseJobResult = { ...base, status: "skipped", reason: "already completed for this session" };
    progress.step("skipped", { reason: r.reason });
    await progress.close();
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: true, summary: r as unknown as Record<string, unknown> }).where(eq(jobRuns.id, jobRow.id));
    return r;
  }

  // Bars window: enough history to cover a backfilled session date plus a margin.
  const span = Math.max(12, Math.ceil((Date.now() - Date.parse(sessionDate)) / 86400000) + 15);

  // Benchmark first. No bar for the session means data is not ready: skip visibly.
  progress.step("fetch S&P 500 bars", { symbol: SPX_SYMBOL, days: span });
  let spxBars;
  try {
    spxBars = await getDailyBars(SPX_SYMBOL, span);
  } catch (e) {
    return finish({ ...base, status: "failed", reason: `S&P 500 fetch failed: ${e instanceof Error ? e.message : String(e)}` });
  }
  const spxIdx = spxBars.findIndex((b) => b.date === sessionDate);
  if (spxIdx < 1) return finish({ ...base, status: "skipped", reason: `No S&P 500 close for ${sessionDate} yet` });
  const spx = { close: spxBars[spxIdx].close, prevClose: spxBars[spxIdx - 1].close };
  await upsertCloses(db, SPX_SYMBOL, spxBars);

  const active = await db
    .select({ h: holdings, teamSlug: teams.slug, teamName: teams.name })
    .from(holdings)
    .innerJoin(teams, eq(teams.id, holdings.teamId))
    .where(eq(holdings.status, "active"));
  const tickers = [...new Set(active.map((a) => a.h.ticker))];
  const result: CloseJobResult = { ...base, tickers: tickers.length };
  progress.step("load holdings", { holdings: active.length, tickers: tickers.length });

  const barsByTicker = new Map<string, { close: number; prevClose: number } | { error: string }>();
  for (const [idx, t] of tickers.entries()) {
    try {
      const bars = await getDailyBars(t, span);
      await upsertCloses(db, t, bars);
      const i = bars.findIndex((b) => b.date === sessionDate);
      if (i < 1) barsByTicker.set(t, { error: `no close for ${sessionDate} (latest ${bars.at(-1)?.date ?? "none"})` });
      else barsByTicker.set(t, { close: bars[i].close, prevClose: bars[i - 1].close });
    } catch (e) {
      barsByTicker.set(t, { error: e instanceof Error ? e.message : String(e) });
    }
    const b = barsByTicker.get(t)!;
    progress.item("bars", idx + 1, tickers.length, { ticker: t, ...("error" in b ? { error: b.error } : { close: b.close, prevClose: b.prevClose }) });
  }

  progress.step("evaluate movements", { threshold: MOVEMENT_THRESHOLD_PP });
  for (const { h, teamSlug } of active) {
    const b = barsByTicker.get(h.ticker)!;
    if ("error" in b) {
      result.dataQuality[h.ticker] = b.error;
      await db
        .insert(movements)
        .values({ holdingId: h.id, sessionDate, status: "open", dueAt: movementDueAt(sessionDate), dataQuality: b.error, evidenceStatus: "ready" })
        .onConflictDoNothing();
      continue;
    }
    const rel = relativeMovePp(b, spx);
    if (!qualifies(rel)) continue;
    result.qualified.push(h.ticker);
    progress.step("qualified", { ticker: h.ticker, relativeMovePp: Number(rel.toFixed(2)) });
    const inserted = await db
      .insert(movements)
      .values({
        holdingId: h.id,
        sessionDate,
        holdingReturnPct: returnPct(b.close, b.prevClose).toFixed(4),
        spxReturnPct: returnPct(spx.close, spx.prevClose).toFixed(4),
        relativeMovePp: rel.toFixed(4),
        status: "open",
        dueAt: movementDueAt(sessionDate),
        evidenceStatus: "pending",
      })
      .onConflictDoNothing()
      .returning({ id: movements.id });
    if (!inserted.length) continue;
    const id = inserted[0].id;
    result.created.push(h.ticker);

    // Factual alert to the team (its leads, or everyone when it has none). Dedupe key ties it to the movement.
    const recipients = await teamRecipients(h.teamId);
    const link = `${process.env.APP_URL ?? ""}/t/${teamSlug}/movements/${id}`;
    const subject = `${h.ticker} moved ${rel >= 0 ? "+" : ""}${rel.toFixed(1)} pp vs S&P 500 on ${sessionDate}`;
    const body = [
      `Major movement: ${h.ticker} (${h.companyName})`,
      `Session: ${sessionDate} (official close)`,
      `Holding return: ${returnPct(b.close, b.prevClose).toFixed(2)}%`,
      `S&P 500 return: ${returnPct(spx.close, spx.prevClose).toFixed(2)}%`,
      `Relative move: ${rel >= 0 ? "+" : ""}${rel.toFixed(2)} pp (rule: |move| >= ${MOVEMENT_THRESHOLD_PP} pp)`,
      `Due: ${formatNY(movementDueAt(sessionDate), "cccc MMM d, h:mm a")} ET`,
      `Workspace: ${link}`,
      "",
      "This is an automated factual alert. Anyone on the team can write the update.",
    ].join("\n");
    for (const r of recipients) {
      const queued = await queueNotification({ kind: "movement_alert", recipientId: r.id, recipientEmail: r.email, refId: id, dedupeKey: `movement:${id}:${r.id}`, subject, body });
      if (queued) result.notifications++;
    }

    if (Date.now() - started < BUDGET_MS) {
      progress.step("gather evidence", { ticker: h.ticker });
      try {
        await gatherMovementEvidence(id);
      } catch (e) {
        result.evidencePending++;
        progress.warn("evidence deferred", { ticker: h.ticker, error: e instanceof Error ? e.message : String(e) });
      }
    } else {
      result.evidencePending++;
      progress.warn("evidence deferred", { ticker: h.ticker, reason: "time budget" });
    }
  }

  progress.step("send notifications", { queued: result.notifications });
  try {
    await sendPendingNotifications();
  } catch (e) {
    progress.warn("notifications deferred", { error: e instanceof Error ? e.message : String(e) });
    // Morning job retries.
  }
  return finish(result);
}
