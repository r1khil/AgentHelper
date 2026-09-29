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
import { earningsHref } from "@/lib/scope";
import { rememberedScope } from "@/lib/teams";

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

/**
 * Leads and admins can rebuild the agent's pre-earnings evidence pack on demand. Building it emails the team's leads the
 * first time (queued for the next send), so the page asks first: `send` is "none" to build without emailing anyone, and a
 * form that doesn't say sends nothing.
 */
export async function rebuildPrepPack(fd: FormData) {
  const row = await load(String(fd.get("id") ?? ""));
  if (!row) return;
  // Back to the report in the scope it was opened in (the fund's or its team's).
  const back = earningsHref(await rememberedScope(row.user), row.slug, row.e.id);
  if (!canManageTeam(row.user, row.h.teamId)) redirect(back);
  const r = await buildPrepPack(row.e.id, { notify: String(fd.get("send") ?? "none") === "list" });
  revalidatePath(row.path);
  revalidatePath(`/t/${row.slug}/agent/h/${row.h.ticker}`);
  redirect(r.ok ? back : `${back}?error=${encodeURIComponent(r.error)}`);
}
