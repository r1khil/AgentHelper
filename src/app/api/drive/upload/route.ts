import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { holdings, teams } from "@/db/schema";
import { canAccessTeam, getCurrentUser } from "@/lib/auth";
import { effectiveMime } from "@/lib/drive/extract";
import { upsertIndexRows } from "@/lib/drive/index";
import { ingestFile } from "@/lib/jobs/ingest";
import { ensureHoldingFolders, itemToRow, uploadFile } from "@/lib/drive/writes";
import { downloadModelFile, removeStagedFile, STAGING_PREFIX } from "@/lib/storage";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  holdingId: z.string().uuid(),
  kind: z.enum(["initiating_coverage", "earnings_update", "model", "other"]),
  stagedPath: z.string().startsWith(STAGING_PREFIX),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().max(200).optional(),
});

/** Step 2 of a document upload: pull the staged copy, add it to the Drive under the holding's folder, index it. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const { holdingId, kind, stagedPath, fileName, mimeType } = parsed.data;

  const [row] = await db.select({ h: holdings, teamName: teams.name, slug: teams.slug }).from(holdings).innerJoin(teams, eq(teams.id, holdings.teamId)).where(eq(holdings.id, holdingId)).limit(1);
  if (!row || !canAccessTeam(user, row.h.teamId)) return Response.json({ ok: false, error: "Holding not found" }, { status: 404 });

  try {
    const data = await downloadModelFile(stagedPath);
    const mime = effectiveMime(mimeType ?? "", fileName) || "application/octet-stream";
    const folder = await ensureHoldingFolders({ id: row.h.id, ticker: row.h.ticker, companyName: row.h.companyName, teamName: row.teamName });
    const item = await uploadFile({ name: fileName, mimeType: mime, parentId: folder.folderId, data });
    await upsertIndexRows([{ ...itemToRow(item, { parentId: folder.folderId, path: `${folder.path}/${item.name}`, isFolder: false, holdingId: row.h.id, ticker: row.h.ticker }), kind, uploadedBy: user.id }]);
    await removeStagedFile(stagedPath).catch(() => undefined);
    revalidatePath(`/t/${row.slug}/h/${row.h.ticker}`);
    // Text, summary, and embeddings are produced after the response so the upload returns quickly.
    after(() => ingestFile(item.id, { reason: "upload" }));
    return Response.json({ ok: true, fileId: item.id, webViewLink: item.webViewLink ?? null, textError: null });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
