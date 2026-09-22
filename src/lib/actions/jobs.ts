"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runCloseJob } from "@/lib/jobs/close";
import { runMorningJob } from "@/lib/jobs/morning";
import { runPricesJob } from "@/lib/jobs/prices";
import { backfillIndustries, refreshBellwethers } from "@/lib/jobs/bellwethers";
import { prepEarnings } from "@/lib/jobs/earnings-prep";
import { syncFilings } from "@/lib/jobs/filings";
import { runIngest } from "@/lib/jobs/ingest";
import { runWeeklyJob } from "@/lib/weekly/job";

export async function runCloseNow(fd: FormData) {
  await requireAdmin();
  const date = String(fd.get("date") ?? "").trim() || undefined;
  const force = fd.get("force") === "on";
  const r = await runCloseJob({ sessionDate: date, force });
  revalidatePath("/admin");
  redirect(`/admin?${r.status === "failed" ? "error" : "ok"}=${encodeURIComponent(`Close job ${r.sessionDate}: ${r.status}${r.reason ? ` (${r.reason})` : ""}; qualified ${r.qualified.join(", ") || "none"}; created ${r.created.length}`)}`);
}

export async function runMorningNow() {
  await requireAdmin();
  const r = await runMorningJob();
  revalidatePath("/admin");
  redirect(`/admin?ok=${encodeURIComponent(`Morning job: evidence ${r.evidenceFinished}, reminders ${r.reminders}, overdue ${r.overdue}, email ${JSON.stringify(r.email)}`)}`);
}

export async function runPricesNow() {
  await requireAdmin();
  const r = await runPricesJob();
  revalidatePath("/admin");
  revalidatePath("/attribution", "layout");
  const failed = Object.keys(r.failed);
  redirect(`/admin?${r.status === "failed" ? "error" : "ok"}=${encodeURIComponent(`Prices job: ${r.status}${r.reason ? ` (${r.reason})` : ""}; updated ${r.updated.length}${failed.length ? `; failed ${failed.join(", ")}` : ""}${r.remaining.length ? `; remaining ${r.remaining.length}` : ""}`)}`);
}

export async function runBellwethersNow() {
  await requireAdmin();
  const industries = await backfillIndustries();
  const r = await refreshBellwethers();
  revalidatePath("/admin");
  revalidatePath("/t/[team]/earnings", "page");
  const failed = Object.keys(r.errors);
  redirect(`/admin?ok=${encodeURIComponent(`Bellwethers: ${r.tickers} names across ${r.etfs} sector ETFs, ${r.dated} with a report date; industries filled ${industries.filled}/${industries.checked}${failed.length ? `; failed ${failed.join(", ")}` : ""}`)}`);
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
  redirect(`/admin?ok=${encodeURIComponent("Syncing SEC filings in the background (new 10-K, 10-Q, 8-K since the last sync). Watch the filings_sync and ingest rows; press again to continue a rate-limited queue.")}`);
}

export async function backfillFilingsNow() {
  await requireAdmin();
  filingsInBackground({ backfill: true });
  revalidatePath("/admin");
  redirect(`/admin?ok=${encodeURIComponent("Backfilling SEC filings in the background (two years of 10-K/10-Q, ninety days of 8-K). Embedding continues a few documents per run; press again after a minute if the ingest row says rate_limited.")}`);
}

/** Re-embed every document whose vectors are not from the current model (a model switch requeues them all). */
export async function reembedNow() {
  await requireAdmin();
  after(async () => {
    const r = await runIngest({ reason: "reembed", budgetMs: 240_000, maxDocs: 60 });
    if (r.status !== "ok") console.warn(`[ingest] reembed ${r.status}${r.reason ? `: ${r.reason}` : ""}`);
  });
  revalidatePath("/admin");
  redirect(`/admin?ok=${encodeURIComponent("Re-embedding in the background with the current model, newest documents first. The counts update as it goes; a rate_limited ingest row means the free-model budget is spent for now.")}`);
}

export async function runEarningsPrepNow() {
  await requireAdmin();
  const r = await prepEarnings();
  revalidatePath("/admin");
  const failed = Object.entries(r.failed);
  redirect(`/admin?${failed.length && !r.built.length ? "error" : "ok"}=${encodeURIComponent(`Prep packs (${r.window.from} to ${r.window.to}): ${r.candidates} upcoming; built ${r.built.join(", ") || "none"}${failed.length ? `; failed ${failed.map(([t, e]) => `${t} (${e.slice(0, 80)})`).join("; ")}` : ""}`)}`);
}

/** The Sunday weekly run, by hand. A date builds the pack for the Friday on or before it. */
export async function runWeeklyNow(fd: FormData) {
  await requireAdmin();
  const today = String(fd.get("date") ?? "").trim() || undefined;
  const r = await runWeeklyJob({ today });
  revalidatePath("/admin");
  revalidatePath("/weekly");
  const build = r.build && "error" in r.build ? `build failed (${r.build.error})` : `built${r.build?.failed.length ? ` with ${r.build.failed.join(", ")} missing` : ""}`;
  const asks = r.asks && "error" in r.asks ? `asks failed (${r.asks.error})` : `asks ${r.asks?.sent ?? 0} sent, ${r.asks?.skipped ?? 0} skipped, ${r.asks?.failed ?? 0} failed`;
  redirect(`/admin?${r.status === "failed" ? "error" : "ok"}=${encodeURIComponent(`Weekly job for week ending ${r.weekEnding}: ${r.reason ?? `${build}; ${asks}`}`)}`);
}
