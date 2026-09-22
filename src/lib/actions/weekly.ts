"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { weeklyUpdates } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { todayNY } from "@/lib/providers/calendar";
import { sendProcessUpdateAsks } from "@/lib/weekly/ask";
import { buildWeeklyPack } from "@/lib/weekly/build";
import { linesToItems } from "@/lib/weekly/format";
import { parseFigureInput } from "@/lib/weekly/figures";
import { ensurePack, getPack, normalizeAgenda, packFigures } from "@/lib/weekly/store";
import { isAgendaSection, AGENDA_LABELS, type WeeklyFigures } from "@/lib/weekly/types";
import { isFriday, lastFriday } from "@/lib/weekly/weeks";

// The whole feature is exec and admin only; each action re-checks rather than trusting the page.
const FUND_WIDE = ["exec", "admin"] as const;

function back(week: string, message: string, ok = false): never {
  redirect(`/weekly/${week}?${ok ? "ok" : "error"}=${encodeURIComponent(message)}`);
}

function weekFrom(fd: FormData): string {
  const week = String(fd.get("week") ?? "").trim();
  if (!isFriday(week)) redirect(`/weekly?error=${encodeURIComponent("That week is not an ISO Friday")}`);
  return week;
}

function revalidateWeek(week: string) {
  revalidatePath("/weekly");
  revalidatePath(`/weekly/${week}`);
}

/** Build or rebuild a pack by hand. Defaults to the Friday that just passed. */
export async function buildWeeklyNow(fd: FormData) {
  await requireRole(...FUND_WIDE);
  const raw = String(fd.get("week") ?? "").trim();
  const week = raw || lastFriday(todayNY());
  if (!isFriday(week)) redirect(`/weekly?error=${encodeURIComponent("That week is not an ISO Friday")}`);
  const r = await buildWeeklyPack(week, { reason: "manual" });
  revalidateWeek(week);
  if (r.status === "skipped") back(week, `Nothing rebuilt: ${r.reason}`, true);
  const parts = [`performers ${r.performers ? `${r.performers.ranked} ranked` : "unavailable"}`, `earnings ${r.earnings ?? 0}`, `market news ${r.marketNews ?? 0}`];
  if (r.agendaHeld) parts.push("agenda kept (this pack has your edits)");
  if (r.failed.length) parts.push(`could not build: ${r.failed.join(", ")}`);
  back(week, `Pack built: ${parts.join("; ")}`, r.failed.length === 0);
}

export async function saveWeeklyFigures(fd: FormData) {
  const me = await requireRole(...FUND_WIDE);
  const week = weekFrom(fd);
  const row = await ensurePack(week);
  if (row.status === "sent") back(week, "This pack is marked sent. Reopen it before editing.");
  const current = packFigures(row);
  const next: WeeklyFigures = { ...current };
  const fields: { key: keyof WeeklyFigures; label: string }[] = [
    { key: "aumK", label: "AUM" },
    { key: "ytdPct", label: "YTD return" },
    { key: "benchmarkYtdPct", label: "SPXTR YTD return" },
  ];
  for (const { key, label } of fields) {
    const parsed = parseFigureInput(String(fd.get(key) ?? ""));
    if (parsed === undefined) back(week, `${label} is not a number I can read. Try 4646.9, 6.8%, or (5.7%).`);
    next[key] = { value: parsed, source: "entered" };
  }
  const now = new Date();
  await db.update(weeklyUpdates).set({ figures: next, editedAt: now, editedBy: me.id, updatedAt: now }).where(eq(weeklyUpdates.weekEnding, week));
  revalidateWeek(week);
  back(week, "Highlights saved", true);
}

/** Save one agenda section from its "Day: text" textarea. */
export async function saveWeeklyField(fd: FormData) {
  const me = await requireRole(...FUND_WIDE);
  const week = weekFrom(fd);
  const section = String(fd.get("section") ?? "");
  if (!isAgendaSection(section)) back(week, "Unknown agenda section");
  const row = await ensurePack(week);
  if (row.status === "sent") back(week, "This pack is marked sent. Reopen it before editing.");
  const agenda = normalizeAgenda(row.agenda);
  agenda[section] = linesToItems(String(fd.get("text") ?? ""));
  const now = new Date();
  await db.update(weeklyUpdates).set({ agenda, editedAt: now, editedBy: me.id, updatedAt: now }).where(eq(weeklyUpdates.weekEnding, week));
  revalidateWeek(week);
  back(week, `${AGENDA_LABELS[section]} saved`, true);
}

export async function markWeeklySent(fd: FormData) {
  const me = await requireRole(...FUND_WIDE);
  const week = weekFrom(fd);
  const now = new Date();
  await db.update(weeklyUpdates).set({ status: "sent", sentAt: now, sentBy: me.id, updatedAt: now }).where(eq(weeklyUpdates.weekEnding, week));
  revalidateWeek(week);
  back(week, "Marked sent. The Sunday job will leave this pack alone.", true);
}

export async function reopenWeekly(fd: FormData) {
  await requireRole(...FUND_WIDE);
  const week = weekFrom(fd);
  await db.update(weeklyUpdates).set({ status: "draft", sentAt: null, sentBy: null, updatedAt: new Date() }).where(eq(weeklyUpdates.weekEnding, week));
  revalidateWeek(week);
  back(week, "Reopened as a draft", true);
}

/** Ask again for the process updates — the button that stands in for a reminder. */
export async function sendWeeklyAskNow(fd: FormData) {
  await requireRole(...FUND_WIDE);
  const week = weekFrom(fd);
  if (!(await getPack(week))) await ensurePack(week);
  const only = String(fd.get("recipient") ?? "").trim() || undefined;
  const r = await sendProcessUpdateAsks(week, { resend: true, only });
  revalidateWeek(week);
  const detail = r.reason ? ` (${r.reason})` : "";
  back(week, `Asks: ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed${detail}`, r.failed === 0);
}
