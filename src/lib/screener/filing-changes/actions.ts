"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { filingChanges, flags, holdings, watchlist } from "@/db/schema";
import { requireUser, type CurrentUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/actions/holdings";
import { canManageTeam, isFundWide } from "@/lib/roles";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Execs and admins judge any name; a lead judges the names their team holds or watches. Associates never do. */
async function mayJudge(user: CurrentUser, ticker: string): Promise<boolean> {
  if (isFundWide(user)) return true;
  if (user.role !== "lead_analyst" || !user.teamId) return false;
  const [held, watched] = await Promise.all([
    db.select({ teamId: holdings.teamId }).from(holdings).where(and(eq(holdings.ticker, ticker), eq(holdings.status, "active"))),
    db.select({ teamId: watchlist.teamId }).from(watchlist).where(eq(watchlist.ticker, ticker)),
  ]);
  return [...held, ...watched].some((r) => canManageTeam(user, r.teamId));
}

/** The lead's verdict on one change: real or noise (null clears it). The calibration of the detector reads these. */
export async function setFilingChangeVerdict(id: string, verdict: "real" | "noise" | null): Promise<ActionResult> {
  const user = await requireUser();
  if (!UUID.test(id) || (verdict !== null && verdict !== "real" && verdict !== "noise")) return { ok: false, error: "Unknown change." };
  const [row] = await db.select({ ticker: filingChanges.ticker }).from(filingChanges).where(eq(filingChanges.id, id)).limit(1);
  if (!row) return { ok: false, error: "Unknown change." };
  if (!(await mayJudge(user, row.ticker))) return { ok: false, error: "Only the team's lead, execs and admins can judge a change." };
  await db
    .update(filingChanges)
    .set(verdict ? { verdict, verdictBy: user.id, verdictAt: new Date() } : { verdict: null, verdictBy: null, verdictAt: null })
    .where(eq(filingChanges.id, id));
  // A verdict resolves the change's flag (off the bell, out of the checklist's unresolved count); clearing it reopens it.
  await db
    .update(flags)
    .set(verdict ? { dismissedBy: user.id, dismissedAt: new Date() } : { dismissedBy: null, dismissedAt: null })
    .where(and(eq(flags.sourceId, id), inArray(flags.kind, ["filing_change", "filing_8k"])));
  revalidatePath("/screener", "layout");
  return { ok: true };
}

/** Take a flag off everyone's list (the bell's own dismiss is per member). The change behind it stays on the Screener. */
export async function dismissFlag(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!UUID.test(id)) return { ok: false, error: "Unknown flag." };
  const [flag] = await db.select().from(flags).where(eq(flags.id, id)).limit(1);
  if (!flag) return { ok: false, error: "Unknown flag." };
  if (!(await mayJudge(user, flag.ticker))) return { ok: false, error: "Only the team's lead, execs and admins can dismiss a flag." };
  const now = new Date();
  await db.update(flags).set({ dismissedBy: user.id, dismissedAt: now }).where(eq(flags.id, id));
  if (flag.kind === "filing_change" || flag.kind === "filing_8k") {
    await db.update(filingChanges).set({ dismissedBy: user.id }).where(eq(filingChanges.id, flag.sourceId));
  }
  revalidatePath("/screener", "layout");
  return { ok: true };
}
