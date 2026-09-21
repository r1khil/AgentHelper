"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { earnings, holdings, teams } from "@/db/schema";
import { canManageTeam, requireTeamAccess } from "@/lib/auth";
import { gatherEarningsResults } from "@/lib/jobs/earnings-results";
import { buildPrepPack } from "@/lib/jobs/earnings-prep";
import { listEarningsEvidence, type Actuals } from "@/lib/earnings";
import { reasoningFeedback } from "@/lib/agent/feedback";

async function load(id: string) {
  const [row] = await db.select({ e: earnings, h: holdings, slug: teams.slug }).from(earnings).innerJoin(holdings, eq(holdings.id, earnings.holdingId)).innerJoin(teams, eq(teams.id, holdings.teamId)).where(eq(earnings.id, id)).limit(1);
  if (!row) return null;
  const user = await requireTeamAccess(row.h.teamId);
  return { ...row, user, path: `/t/${row.slug}/earnings/${row.e.id}` };
}

export async function saveChecklist(fd: FormData) {
  const r = await load(String(fd.get("id") ?? ""));
  if (!r || r.e.preLockedAt) return;
  await db
    .update(earnings)
    .set({
      expectations: String(fd.get("expectations") ?? "").slice(0, 10000) || null,
      keyQuestions: String(fd.get("keyQuestions") ?? "").slice(0, 10000) || null,
      thesisChangeCriteria: String(fd.get("thesisChangeCriteria") ?? "").slice(0, 10000) || null,
    })
    .where(eq(earnings.id, r.e.id));
  revalidatePath(r.path);
}

export async function lockChecklist(fd: FormData) {
  const r = await load(String(fd.get("id") ?? ""));
  if (!r || r.e.preLockedAt) return;
  await saveChecklist(fd);
  await db.update(earnings).set({ preLockedAt: new Date() }).where(eq(earnings.id, r.e.id));
  revalidatePath(r.path);
}

export async function gatherResults(fd: FormData) {
  const r = await load(String(fd.get("id") ?? ""));
  if (!r) return;
  await gatherEarningsResults(r.e.id);
  revalidatePath(r.path);
}

export async function saveReflection(fd: FormData) {
  const r = await load(String(fd.get("id") ?? ""));
  if (!r) return;
  const reflection = String(fd.get("reflection") ?? "").slice(0, 20000);
  await db.update(earnings).set({ reflection: reflection || null, reflectionBy: r.user.id, reflectionAt: new Date() }).where(eq(earnings.id, r.e.id));
  revalidatePath(r.path);
  revalidatePath(`/t/${r.slug}/earnings`);
}

export async function markReviewed(fd: FormData) {
  const r = await load(String(fd.get("id") ?? ""));
  if (!r) return;
  const reflection = String(fd.get("reflection") ?? "").slice(0, 20000);
  if (!reflection.trim()) return;
  await db.update(earnings).set({ reflection, reflectionBy: r.user.id, reflectionAt: new Date(), status: "reviewed" }).where(eq(earnings.id, r.e.id));
  revalidatePath(r.path);
  revalidatePath(`/t/${r.slug}/earnings`);
}

export async function requestEarningsFeedback(fd: FormData) {
  const r = await load(String(fd.get("id") ?? ""));
  if (!r) return;
  const reflection = String(fd.get("reflection") ?? "").slice(0, 20000);
  if (!reflection.trim()) return;
  const evidence = await listEarningsEvidence(r.e.id);
  const actuals = r.e.actuals as Actuals | null;
  const evidenceText = [
    ...(actuals?.rows ?? []).map((row) => `- ${row.metric}: actual ${row.actual ?? "n/a"}; prior year ${row.priorYear ?? "n/a"}; prior guidance ${row.priorGuidance ?? "n/a"}; estimate ${row.estimate ?? "n/a"}`),
    ...evidence.map((ev) => `- [${ev.kind}] ${ev.title}${ev.url ? ` ${ev.url}` : ""}`),
  ].join("\n");
  const expectations = [r.e.expectations && `Expectations: ${r.e.expectations}`, r.e.keyQuestions && `Key questions: ${r.e.keyQuestions}`, r.e.thesisChangeCriteria && `What would change the thesis: ${r.e.thesisChangeCriteria}`].filter(Boolean).join("\n");
  const feedback = await reasoningFeedback({ kind: "earnings", ticker: r.h.ticker, studentText: reflection, thesis: r.h.thesis, evidence: evidenceText, expectations: expectations || null });
  await db.update(earnings).set({ reflection, feedback, reflectionBy: r.user.id, reflectionAt: new Date() }).where(eq(earnings.id, r.e.id));
  revalidatePath(r.path);
}

/** Leads and admins can rebuild the agent's pre-earnings evidence pack on demand. */
export async function rebuildPrepPack(fd: FormData) {
  const row = await load(String(fd.get("id") ?? ""));
  if (!row) return;
  if (!canManageTeam(row.user, row.h.teamId)) redirect(row.path);
  const r = await buildPrepPack(row.e.id);
  revalidatePath(row.path);
  revalidatePath(`/t/${row.slug}/agent/h/${row.h.ticker}`);
  redirect(r.ok ? row.path : `${row.path}?error=${encodeURIComponent(r.error)}`);
}
