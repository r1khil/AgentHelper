"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { runCloseJob } from "@/lib/jobs/close";
import { runMorningJob } from "@/lib/jobs/morning";
import { runPricesJob } from "@/lib/jobs/prices";
import { backfillIndustries, refreshBellwethers } from "@/lib/jobs/bellwethers";
import { prepEarnings } from "@/lib/jobs/earnings-prep";

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

export async function runEarningsPrepNow() {
  await requireAdmin();
  const r = await prepEarnings();
  revalidatePath("/admin");
  const failed = Object.entries(r.failed);
  redirect(`/admin?${failed.length && !r.built.length ? "error" : "ok"}=${encodeURIComponent(`Prep packs (${r.window.from} to ${r.window.to}): ${r.candidates} upcoming; built ${r.built.join(", ") || "none"}${failed.length ? `; failed ${failed.map(([t, e]) => `${t} (${e.slice(0, 80)})`).join("; ")}` : ""}`)}`);
}
