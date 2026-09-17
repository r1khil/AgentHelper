"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { parseCompleteOnboarding } from "@/lib/onboarding";
import type { ActionResult } from "@/lib/actions/holdings";

export async function completeOnboarding(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (user.onboardedAt) return { ok: true };
  const parsed = parseCompleteOnboarding(fd);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
  const now = new Date();
  await db
    .update(profiles)
    .set({ fullName: parsed.data.fullName, boundaryAcknowledgedAt: now, onboardedAt: now })
    .where(eq(profiles.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true, message: `Welcome, ${parsed.data.fullName.split(" ")[0]}` };
}
