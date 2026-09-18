import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driveConnection } from "@/db/schema";
import { loadConnection } from "@/lib/drive/auth";
import { verifyChannelHeaders } from "@/lib/drive/webhook-verify";
import { claimSyncLock, runIncrementalSync } from "@/lib/jobs/drive";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Google Drive push notifications (changes.watch). Public by design: the per-channel token we registered is the
 * auth. Responds immediately and does the incremental sync after the response; concurrent notifications collapse
 * into one run through the sync lock, and a run re-checks for notifications that landed while it worked.
 */
export async function POST(req: Request) {
  const conn = await loadConnection().catch(() => null);
  const v = verifyChannelHeaders(req.headers, conn);
  if (!v.ok) return new Response(v.reason, { status: v.status });
  if (v.state === "sync") return new Response(null, { status: 200 });

  await db.update(driveConnection).set({ changeNotifiedAt: new Date() }).where(eq(driveConnection.id, 1));
  after(async () => {
    try {
      if (!(await claimSyncLock())) return;
      await runIncrementalSync({ reason: "webhook", ingest: { budgetMs: 200_000, maxFiles: 10 } });
    } catch (e) {
      console.warn("[drive] webhook sync failed", e);
    }
  });
  return new Response(null, { status: 200 });
}

export function GET() {
  return new Response(null, { status: 405 });
}
