"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { requireRole, requireUser } from "@/lib/auth";
import { pruneDismissed } from "@/lib/hoot/policy";
import type { ActionResult } from "@/lib/actions/holdings";

/** Exec/admin only: reveal how the agent, attribution and jobs are computed. */
export async function setTransparencyMode(on: boolean): Promise<ActionResult> {
  const user = await requireRole("exec", "admin");
  await db.update(profiles).set({ transparencyMode: on }).where(eq(profiles.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Show or hide Hoot, the companion. Anyone can; it only affects their own view. */
export async function setHootEnabled(on: boolean): Promise<ActionResult> {
  const user = await requireUser();
  await db.update(profiles).set({ hoot: { ...user.hoot, enabled: on } }).where(eq(profiles.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Remember that a nudge or page tip was dismissed or opened, so Hoot doesn't bring it up again. */
export async function dismissHootNudge(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!/^[\w:,.-]{1,2000}$/.test(id)) return { ok: false, error: "Unknown nudge." };
  const now = new Date();
  const dismissed = pruneDismissed({ ...user.hoot?.dismissed, [id]: now.toISOString() }, now);
  await db.update(profiles).set({ hoot: { ...user.hoot, dismissed } }).where(eq(profiles.id, user.id));
  return { ok: true };
}
