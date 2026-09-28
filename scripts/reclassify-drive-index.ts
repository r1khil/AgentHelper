// One-off: re-run the Drive classifier over the stored index (no Drive API calls) and show every file whose holding
// or ticker would change under the current matching rules, e.g. the Amazon workbook kept in Meta's "Old Models"
// folder. Dry run by default. --apply writes the new holding/ticker to drive_files, their documents rows and those
// documents' chunks in one transaction; app-uploaded files keep their holding, as the sync does. The next full
// Drive sync (the morning job, or Admin › Sync now) makes the same drive_files/documents/chunks change on its own.
//   npx tsx --conditions=react-server scripts/reclassify-drive-index.ts [--apply]
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { eq, sql as dsql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { documentChunks, documents, driveConnection, driveFiles, holdings, teams } from "../src/db/schema";
import { classifyTree, type DriveItem } from "../src/lib/drive/tree";

async function main() {
  const apply = process.argv.includes("--apply");
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const db = drizzle(sql);

  const [conn] = await db.select({ rootFolderId: driveConnection.rootFolderId }).from(driveConnection).where(eq(driveConnection.id, 1));
  if (!conn?.rootFolderId) throw new Error("No Drive root folder is set.");
  const rows = await db.select().from(driveFiles);
  const hs = await db.select({ id: holdings.id, ticker: holdings.ticker, companyName: holdings.companyName, teamId: holdings.teamId }).from(holdings).where(eq(holdings.status, "active"));
  const ts = await db.select({ id: teams.id, name: teams.name }).from(teams);
  const tickerOf = new Map(hs.map((h) => [h.id, h.ticker]));

  const items: DriveItem[] = rows.map((r) => ({ id: r.id, name: r.name, mimeType: r.mimeType, parents: r.parentId ? [r.parentId] : undefined }));
  const { items: classified } = classifyTree(conn.rootFolderId, items, hs, ts);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const changes = classified
    .filter((c) => !c.isFolder)
    .map((c) => ({ c, row: byId.get(c.id)! }))
    .filter(({ c, row }) => !row.createdByApp && (c.holdingId !== row.holdingId || c.ticker !== row.ticker))
    .map(({ c, row }) => ({ id: c.id, path: row.path, fromHolding: row.holdingId, fromTicker: row.ticker, toHolding: c.holdingId, toTicker: c.ticker }));

  const label = (holdingId: string | null, ticker: string | null) => `${holdingId ? (tickerOf.get(holdingId) ?? "exited holding") : "no holding"} / ticker ${ticker ?? "none"}`;
  for (const ch of changes) {
    const [chunks] = await db.select({ n: dsql`count(*)`.mapWith(Number) }).from(documentChunks).where(eq(documentChunks.documentId, ch.id));
    console.log(`${ch.id}\n  ${ch.path}\n  ${label(ch.fromHolding, ch.fromTicker)} → ${label(ch.toHolding, ch.toTicker)}  (${chunks?.n ?? 0} chunks)`);
  }
  const skipped = rows.length - classified.length;
  console.log(`${changes.length} of ${classified.filter((c) => !c.isFolder).length} indexed files would change.${skipped ? ` ${skipped} stored rows no longer reach the root and were left out.` : ""}`);

  if (!apply) {
    console.log("Dry run: nothing written. Re-run with --apply to write these changes.");
  } else if (changes.length) {
    await db.transaction(async (tx) => {
      for (const ch of changes) {
        await tx.update(driveFiles).set({ holdingId: ch.toHolding, ticker: ch.toTicker }).where(eq(driveFiles.id, ch.id));
        await tx.update(documents).set({ holdingId: ch.toHolding, ticker: ch.toTicker, updatedAt: new Date() }).where(eq(documents.id, ch.id));
        await tx.update(documentChunks).set({ holdingId: ch.toHolding, ticker: ch.toTicker }).where(eq(documentChunks.documentId, ch.id));
      }
    });
    console.log(`Wrote ${changes.length} files.`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
