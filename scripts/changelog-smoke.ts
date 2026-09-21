// Writes summaries for merged pull requests that changelog_entries lacks, then prints the table.
// Usage: GITHUB_TOKEN=... npm run changelog:sync -- [max]
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const { syncChangelog, loadChangelog } = await import("../src/lib/changelog");
  const max = Number(process.argv[2] ?? 5);
  const result = await syncChangelog({ max, fresh: true });
  console.log("sync:", result);
  for (const e of await loadChangelog()) {
    console.log(`\n#${e.prNumber} · ${e.mergedAt.toISOString().slice(0, 10)} · ${e.author} · ${e.model}\n  ${e.headline}\n  ${e.summary}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
