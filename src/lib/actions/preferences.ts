"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import type { ActionResult } from "@/lib/actions/holdings";

/** Exec/admin only: reveal how the agent, attribution and jobs are computed. */
export async function setTransparencyMode(on: boolean): Promise<ActionResult> {
  const user = await requireRole("exec", "admin");
  await db.update(profiles).set({ transparencyMode: on }).where(eq(profiles.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true };
}
