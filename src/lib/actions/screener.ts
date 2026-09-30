"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { bearCases, screenHits, tearSheets } from "@/db/schema";
import { canManageTeam, requireOnboardedUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/actions/holdings";
import { agentConfigured } from "@/lib/agent/model";
import { todayNY } from "@/lib/providers/calendar";
import { tickerToCik } from "@/lib/providers/edgar";
import { answerBearPoint, runBearCase } from "@/lib/screener/bear-case";
import { cohortOf, CONFIDENCE_LEVELS } from "@/lib/screener/calibration";
import { listFilingChanges } from "@/lib/screener/filing-changes/store";
import { insertPitch, runPitchChecks } from "@/lib/screener/pitches";
import { writeTearSheet } from "@/lib/screener/tear-sheets";
import { loadValueTrapChecklist } from "@/lib/screener/value-trap";
import { addWatch, getWatch, removeWatch } from "@/lib/screener/watchlist";

const page = (ticker?: string) => {
  revalidatePath("/screener");
  if (ticker) revalidatePath(`/screener/${ticker}`);
};

const fail = (error: string): ActionResult => ({ ok: false, error });
const TEAM_ONLY = "Only the team's lead analysts, execs and admins can do that.";

/** Adds a name to a team's watchlist. */
export async function addToWatchlist(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireOnboardedUser();
  const teamId = String(fd.get("teamId") ?? "");
  if (!teamId || !canManageTeam(user, teamId)) return fail(TEAM_ONLY);
  const r = await addWatch(teamId, String(fd.get("ticker") ?? ""), user.id);
  if (!r.ok) return fail(r.error);
  page(r.row.ticker);
  return { ok: true, message: `${r.row.ticker} added. Its filings are checked for changes each evening.` };
}

export async function removeFromWatchlist(id: string): Promise<ActionResult> {
  const user = await requireOnboardedUser();
  const row = await getWatch(id);
  if (!row) return fail("That name isn't on the watchlist any more.");
  if (!canManageTeam(user, row.teamId)) return fail(TEAM_ONLY);
  await removeWatch(id);
  page(row.ticker);
  return { ok: true, message: `${row.ticker} removed.` };
}

const pitchSchema = z.object({
  ticker: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9.-]{0,9}$/, "Type a ticker."),
  teamId: z.string().uuid("Choose the team pitching it."),
  pitchedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  intrinsicValue: z.coerce.number().positive("Intrinsic value per share must be above zero."),
  priceTarget: z.coerce.number().positive("The price target must be above zero."),
  horizonMonths: z.coerce.number().int().min(1).max(60),
  confidence: z.coerce.number().refine((n) => (CONFIDENCE_LEVELS as readonly number[]).includes(n), "Confidence is 50, 70 or 90%."),
  keyMetric: z.string().trim().min(3, "Name the one metric the thesis depends on."),
  kill: z.array(z.string().trim()).transform((xs) => xs.filter(Boolean)).pipe(z.array(z.string()).min(1, "Write at least one kill criterion.").max(3, "Three kill criteria at most.")),
});

/** Records a pitch's estimates and kill criteria (Module 7), then checks what code can check right away. */
export async function recordPitch(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireOnboardedUser();
  const parsed = pitchSchema.safeParse({
    ticker: fd.get("ticker"),
    teamId: fd.get("teamId"),
    pitchedOn: fd.get("pitchedOn") || todayNY(),
    intrinsicValue: fd.get("intrinsicValue"),
    priceTarget: fd.get("priceTarget"),
    horizonMonths: fd.get("horizonMonths"),
    confidence: fd.get("confidence"),
    keyMetric: fd.get("keyMetric"),
    kill: fd.getAll("kill").map(String),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the pitch's fields.");
  const p = parsed.data;
  if (!canManageTeam(user, p.teamId)) return fail(TEAM_ONLY);
  await insertPitch({ ...p, cohort: cohortOf(p.pitchedOn), killCriteria: p.kill, createdBy: user.id });
  await runPitchChecks({ tickers: [p.ticker] }).catch(() => undefined);
  page(p.ticker);
  return { ok: true, message: `Pitch recorded for ${p.ticker}.` };
}

/** Runs Hoot's bear case on a company from the pitch text the team pastes in (Module 6, on demand until trade proposals exist). */
export async function runBearCaseAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireOnboardedUser();
  const ticker = String(fd.get("ticker") ?? "").toUpperCase();
  const teamId = String(fd.get("teamId") ?? "") || null;
  const pitch = String(fd.get("pitch") ?? "").trim();
  if (teamId ? !canManageTeam(user, teamId) : user.role !== "exec" && user.role !== "admin") return fail(TEAM_ONLY);
  if (pitch.length < 40) return fail("Paste the pitch's thesis (a few sentences at least) for Hoot to argue against.");
  if (!agentConfigured()) return fail("Hoot isn't set up on this deployment.");
  const sec = await tickerToCik(ticker).catch(() => null);
  if (!sec) return fail(`${ticker} isn't an SEC registrant, so there's no checklist to build.`);
  const [checklist, changes] = await Promise.all([loadValueTrapChecklist(ticker, sec.cik), listFilingChanges({ tickers: [ticker], limit: 20 }).catch(() => [])]);
  const row = await runBearCase({ ticker, teamId, pitch, checklist, changes, createdBy: user.id });
  page(ticker);
  return row.status === "ready" ? { ok: true, message: "The bear case is ready. Answer each point below." } : fail(`Held back: ${row.heldReason}`);
}

export async function answerBearPointAction(id: string, index: number, response: string): Promise<ActionResult> {
  const user = await requireOnboardedUser();
  const [row] = await db.select({ teamId: bearCases.teamId, ticker: bearCases.ticker }).from(bearCases).where(eq(bearCases.id, id));
  if (!row) return fail("That bear case is gone.");
  if (row.teamId ? !canManageTeam(user, row.teamId) : user.role !== "exec" && user.role !== "admin") return fail(TEAM_ONLY);
  if (!(await answerBearPoint(id, index, response.slice(0, 4000), user.fullName))) return fail("That point is gone.");
  page(row.ticker);
  return { ok: true };
}

/** Writes (or rewrites) a screen hit's tear sheet now, instead of waiting for the monthly run. */
export async function writeTearSheetAction(hitId: string): Promise<ActionResult> {
  const user = await requireOnboardedUser();
  const [hit] = await db.select().from(screenHits).where(eq(screenHits.id, hitId));
  if (!hit) return fail("That screen hit is gone.");
  if (hit.teamId ? !canManageTeam(user, hit.teamId) : user.role !== "exec" && user.role !== "admin") return fail(TEAM_ONLY);
  if (!agentConfigured()) return fail("Hoot isn't set up on this deployment.");
  let sheet;
  try {
    sheet = await writeTearSheet(hit, { force: true });
  } catch (e) {
    return fail(`Couldn't read ${hit.ticker}'s filings: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
  }
  page(hit.ticker);
  if (!sheet) return fail(`No 10-K to write from for ${hit.ticker}.`);
  return sheet.status === "shown" ? { ok: true } : fail(`Held back: ${sheet.heldReason}`);
}

/** A lead's one rating of a tear sheet: useful or not (the Phase 2 measure). */
export async function rateTearSheet(id: string, rating: "useful" | "not_useful" | null): Promise<ActionResult> {
  const user = await requireOnboardedUser();
  if (user.role === "associate_analyst") return fail(TEAM_ONLY);
  const [row] = await db.update(tearSheets).set({ rating, ratedBy: rating ? user.id : null }).where(eq(tearSheets.id, id)).returning({ ticker: tearSheets.ticker });
  if (!row) return fail("That tear sheet is gone.");
  page(row.ticker);
  return { ok: true };
}
