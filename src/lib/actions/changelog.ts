"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin, requireRole } from "@/lib/auth";
import { CHANGELOG_TAG, regenerateChangelogEntry, syncChangelog } from "@/lib/changelog";

export async function refreshChangelog() {
  await requireRole("exec", "admin");
  revalidateTag(CHANGELOG_TAG, { expire: 0 });
  await syncChangelog({ max: 10, fresh: true });
  revalidatePath("/changelog");
}

export async function regenerateEntry(fd: FormData) {
  await requireAdmin();
  const n = Number(fd.get("prNumber"));
  if (!Number.isInteger(n) || n <= 0) return;
  await regenerateChangelogEntry(n);
  revalidatePath("/changelog");
}
