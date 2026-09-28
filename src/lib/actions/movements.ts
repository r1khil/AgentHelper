"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { holdings, movements, teams } from "@/db/schema";
import { requireTeamAccess } from "@/lib/auth";
import { fmtBp, fmtPct, ppToBp } from "@/lib/format";
import { gatherMovementEvidence } from "@/lib/jobs/evidence";

async function load(movementId: string) {
  const [row] = await db.select({ m: movements, h: holdings, slug: teams.slug }).from(movements).innerJoin(holdings, eq(holdings.id, movements.holdingId)).innerJoin(teams, eq(teams.id, holdings.teamId)).where(eq(movements.id, movementId)).limit(1);
  if (!row) return null;
  const user = await requireTeamAccess(row.h.teamId);
  return { ...row, user, path: `/t/${row.slug}/movements/${row.m.id}` };
}

export async function saveMovementUpdate(fd: FormData) {
  const r = await load(String(fd.get("id") ?? ""));
  if (!r) return;
  const text = String(fd.get("updateText") ?? "").slice(0, 20000);
  await db.update(movements).set({ updateText: text, status: r.m.status === "open" && text.trim() ? "in_progress" : r.m.status }).where(eq(movements.id, r.m.id));
  revalidatePath(r.path);
}

export async function completeMovement(fd: FormData) {
  const r = await load(String(fd.get("id") ?? ""));
  if (!r) return;
  const text = String(fd.get("updateText") ?? "").slice(0, 20000);
  if (!text.trim()) return;
  await db.update(movements).set({ updateText: text, status: "completed", completedBy: r.user.id, completedAt: new Date() }).where(eq(movements.id, r.m.id));
  revalidatePath(r.path);
  revalidatePath(`/t/${r.slug}/movements`);
  revalidatePath("/");
}

export async function reopenMovement(fd: FormData) {
  const r = await load(String(fd.get("id") ?? ""));
  if (!r) return;
  await db.update(movements).set({ status: "in_progress", completedAt: null, completedBy: null }).where(eq(movements.id, r.m.id));
  revalidatePath(r.path);
}

export async function rerunEvidence(fd: FormData) {
  const r = await load(String(fd.get("id") ?? ""));
  if (!r) return;
  await gatherMovementEvidence(r.m.id);
  revalidatePath(r.path);
}

export async function requestMovementFeedback(fd: FormData) {
  const r = await load(String(fd.get("id") ?? ""));
  if (!r) return;
  const text = String(fd.get("updateText") ?? "").slice(0, 20000);
  if (!text.trim()) return;
  const { listEvidence } = await import("@/lib/movements");
  const { reasoningFeedback } = await import("@/lib/agent/feedback");
  const evidence = await listEvidence(r.m.id);
  const evidenceText = [
    `Session ${r.m.sessionDate}: ${r.h.ticker} ${fmtPct(r.m.holdingReturnPct)} vs S&P ${fmtPct(r.m.spxReturnPct)} (relative ${fmtBp(ppToBp(r.m.relativeMovePp))}).`,
    ...evidence.map((e) => `- [${e.kind}] ${e.title}${e.publishedAt ? ` (${e.publishedAt.toISOString().slice(0, 10)})` : ""}${e.url ? ` ${e.url}` : ""}`),
  ].join("\n");
  const feedback = await reasoningFeedback({ kind: "movement", ticker: r.h.ticker, studentText: text, thesis: r.h.thesis, evidence: evidenceText });
  await db.update(movements).set({ updateText: text, feedback, status: r.m.status === "open" ? "in_progress" : r.m.status }).where(eq(movements.id, r.m.id));
  revalidatePath(r.path);
}
