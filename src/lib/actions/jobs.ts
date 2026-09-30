"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runMorningJob } from "@/lib/jobs/morning";
import { runPricesJob } from "@/lib/jobs/prices";
import { runDailyBriefAnalysis, sendDailyBrief } from "@/lib/jobs/daily-brief";
import { backfillIndustries, refreshBellwethers } from "@/lib/jobs/bellwethers";
import { prepEarnings } from "@/lib/jobs/earnings-prep";
import { syncFilings } from "@/lib/jobs/filings";
import { runIngest } from "@/lib/jobs/ingest";
import { runWeeklyJob } from "@/lib/weekly/job";

/**
 * A job that emails people asks first (the Admin page's confirmation) and posts `send`: "none" runs it without sending
 * anything, "list" lets it email who it normally would, and for the daily brief "me" emails only the admin pressing the button.
 * A form that doesn't say sends nothing.
 */
const sendChoice = (fd: FormData | undefined) => String(fd?.get("send") ?? "none");

export async function runMorningNow(fd?: FormData) {
  await requireAdmin();
  const r = await runMorningJob({ notify: sendChoice(fd) === "list" });
  revalidatePath("/admin");
  redirect(`/admin?tab=jobs&ok=${encodeURIComponent(`Morning job: email ${JSON.stringify(r.email)}`)}`);
}

export async function runPricesNow() {
  await requireAdmin();
  const r = await runPricesJob();
  revalidatePath("/admin");
  // The Portfolio's views and holdings (cache tags carry the (app) route group).
  revalidatePath("/(app)/t/[team]", "layout");
  const failed = Object.keys(r.failed);
  redirect(`/admin?tab=jobs&${r.status === "failed" ? "error" : "ok"}=${encodeURIComponent(`Prices job: ${r.status}${r.reason ? ` (${r.reason})` : ""}; updated ${r.updated.length}${failed.length ? `; failed ${failed.join(", ")}` : ""}${r.remaining.length ? `; remaining ${r.remaining.length}` : ""}`)}`);
}

export async function runBellwethersNow() {
  await requireAdmin();
  const industries = await backfillIndustries();
  const r = await refreshBellwethers();
  revalidatePath("/admin");
  revalidatePath("/markets");
  const failed = Object.keys(r.errors);
  redirect(`/admin?tab=jobs&ok=${encodeURIComponent(`Bellwethers: ${r.tickers} names across ${r.etfs} sector ETFs, ${r.dated} with a report date; industries filled ${industries.filled}/${industries.checked}${failed.length ? `; failed ${failed.join(", ")}` : ""}`)}`);
}

/** Filings sync runs after the redirect (listing EDGAR and embedding take minutes); repeated presses continue the queue. */
function filingsInBackground(opts: { backfill: boolean }) {
  after(async () => {
    const r = await syncFilings({ backfill: opts.backfill, budgetMs: 240_000, reason: opts.backfill ? "admin backfill" : "admin" });
    if (r.status !== "ok" || r.failed.length || r.ingest?.status === "rate_limited") console.warn(`[filings] sync ${r.status}${r.reason ? `: ${r.reason}` : ""}; failed ${r.failed.length}; ingest ${r.ingest?.status ?? "not run"}`);
  });
}

export async function syncFilingsNow() {
  await requireAdmin();
  filingsInBackground({ backfill: false });
  revalidatePath("/admin");
  redirect(`/admin?tab=jobs&ok=${encodeURIComponent("Syncing SEC filings in the background (new 10-K, 10-Q, 8-K since the last sync). Watch the filings_sync and ingest rows; press again to continue a rate-limited queue.")}`);
}

export async function backfillFilingsNow() {
  await requireAdmin();
  filingsInBackground({ backfill: true });
  revalidatePath("/admin");
  redirect(`/admin?tab=jobs&ok=${encodeURIComponent("Backfilling SEC filings in the background (two years of 10-K/10-Q, ninety days of 8-K). Embedding continues a few documents per run; press again after a minute if the ingest row says rate_limited.")}`);
}

/** Re-embed every document whose vectors are not from the current model (a model switch requeues them all). */
export async function reembedNow() {
  await requireAdmin();
  after(async () => {
    const r = await runIngest({ reason: "reembed", budgetMs: 240_000, maxDocs: 60 });
    if (r.status !== "ok") console.warn(`[ingest] reembed ${r.status}${r.reason ? `: ${r.reason}` : ""}`);
  });
  revalidatePath("/admin");
  redirect(`/admin?tab=jobs&ok=${encodeURIComponent("Re-embedding in the background with the current model, newest documents first. The counts update as it goes; a rate_limited ingest row means the free-model budget is spent for now.")}`);
}

export async function runEarningsPrepNow(fd?: FormData) {
  await requireAdmin();
  const r = await prepEarnings({ notify: sendChoice(fd) === "list" });
  revalidatePath("/admin");
  const failed = Object.entries(r.failed);
  redirect(`/admin?tab=jobs&${failed.length && !r.built.length ? "error" : "ok"}=${encodeURIComponent(`Prep packs (${r.window.from} to ${r.window.to}): ${r.candidates} upcoming; built ${r.built.join(", ") || "none"}${failed.length ? `; failed ${failed.map(([t, e]) => `${t} (${e.slice(0, 80)})`).join("; ")}` : ""}`)}`);
}

/** The Sunday weekly run, by hand. A date builds the pack for the Friday on or before it. */
export async function runWeeklyNow(fd: FormData) {
  await requireAdmin();
  const today = String(fd.get("date") ?? "").trim() || undefined;
  const r = await runWeeklyJob({ today, send: sendChoice(fd) === "list" });
  revalidatePath("/admin");
  revalidatePath("/weekly");
  const build = r.build && "error" in r.build ? `build failed (${r.build.error})` : `built${r.build?.failed.length ? ` with ${r.build.failed.join(", ")} missing` : ""}`;
  const email = !r.email ? "no email" : "error" in r.email ? `email failed (${r.email.error})` : r.email.status === "sent" ? `emailed ${r.email.to}` : `email ${r.email.status}${r.email.reason ? ` (${r.email.reason})` : ""}`;
  redirect(`/admin?tab=jobs&${r.status === "failed" ? "error" : "ok"}=${encodeURIComponent(`Weekly job for week ending ${r.weekEnding}: ${r.reason ?? `${build}; ${email}`}`)}`);
}

/** Hoot's daily attribution brief, by hand: write it, then email it as chosen: "none" writes it and sends nothing, "me" emails the pressing admin only, "list" the whole list. */
export async function runDailyBriefNow(fd: FormData) {
  const admin = await requireAdmin();
  const date = String(fd.get("date") ?? "").trim() || undefined;
  const choice = sendChoice(fd);
  const a = await runDailyBriefAnalysis({ sessionDate: date });
  if (choice !== "me" && choice !== "list") {
    revalidatePath("/admin");
    redirect(`/admin?tab=jobs&${a.status === "failed" ? "error" : "ok"}=${encodeURIComponent(`Daily brief ${a.sessionDate}: analysis ${a.status}${a.reason ? ` (${a.reason})` : ""}; nothing was emailed`)}`);
  }
  const everyone = choice === "list";
  const s = await sendDailyBrief({ sessionDate: a.sessionDate, force: everyone, to: everyone ? undefined : [admin.email] });
  revalidatePath("/admin");
  const failed = Object.keys(s.failed);
  redirect(`/admin?tab=jobs&${a.status === "failed" && s.status !== "ok" ? "error" : "ok"}=${encodeURIComponent(`Daily brief ${a.sessionDate}: analysis ${a.status}${a.reason ? ` (${a.reason})` : ""}; email ${s.status}${s.reason ? ` (${s.reason})` : ""}, ${s.analysis}, sent to ${s.sent.join(", ") || "nobody"}${failed.length ? `; failed ${failed.join(", ")}` : ""}`)}`);
}
