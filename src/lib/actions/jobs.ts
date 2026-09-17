"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { runCloseJob } from "@/lib/jobs/close";
import { runMorningJob } from "@/lib/jobs/morning";
import { runPricesJob } from "@/lib/jobs/prices";

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
