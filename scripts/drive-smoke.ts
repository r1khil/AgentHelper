// Smoke test for the Drive index without OAuth: exercises the DB queries and the classifier end to end.
// Usage: npx tsx --conditions=react-server scripts/drive-smoke.ts
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { driveStatus, searchIndex, listHoldingFiles, upsertIndexRows } = await import("../src/lib/drive/index");
  const { db } = await import("../src/db/client");
  const { driveFiles, holdings } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");

  console.log("status", await driveStatus());
  const [h] = await db.select({ id: holdings.id, ticker: holdings.ticker }).from(holdings).where(eq(holdings.status, "active")).limit(1);
  console.log("sample holding", h);
  if (h) {
    const id = `smoke-${Date.now()}`;
    await upsertIndexRows([{ id, name: `${h.ticker} Initiating Coverage.pdf`, mimeType: "application/pdf", parentId: null, path: `Test/${h.ticker} (${h.ticker})/${h.ticker} Initiating Coverage.pdf`, isFolder: false, size: 1234, modifiedTime: new Date(), webViewLink: null, md5: null, ticker: h.ticker, holdingId: h.id, kind: "initiating_coverage", createdByApp: false, indexedAt: new Date() }]);
    await upsertIndexRows([{ id, name: `${h.ticker} Initiating Coverage v2.pdf`, mimeType: "application/pdf", parentId: null, path: `Test/x`, isFolder: false, size: 1, modifiedTime: new Date(), webViewLink: null, md5: null, ticker: h.ticker, holdingId: h.id, kind: "initiating_coverage", createdByApp: false, indexedAt: new Date() }]);
    console.log("holding files", (await listHoldingFiles(h.id)).map((f) => [f.id, f.name, f.kind]));
    console.log("search by query", (await searchIndex({ query: "coverage", limit: 5 })).map((f) => f.name));
    console.log("search by ids", (await searchIndex({ ids: [id], limit: 5 })).map((f) => f.name));
    console.log("search by kind+ticker", (await searchIndex({ ticker: h.ticker.toLowerCase(), kind: "initiating_coverage", limit: 5 })).map((f) => f.name));
    await db.delete(driveFiles).where(eq(driveFiles.id, id));
    console.log("cleaned up");
  }
  console.log("status after", await driveStatus());
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
