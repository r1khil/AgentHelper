import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: the price target sheet is a live document the fund depends on. The app may only read it. If this test fails,
 * someone widened what the app can do to that sheet; that is a product decision, not a refactor.
 */
const here = new URL(".", import.meta.url).pathname;
const read = (f: string) => readFileSync(`${here}${f}`, "utf8");

describe("PT sheet reader stays read-only", () => {
  const src = read("read.ts");

  it("sends only GET requests", () => {
    const methods = [...src.matchAll(/method:\s*"(\w+)"/g)].map((m) => m[1]);
    expect(methods.length).toBeGreaterThan(0);
    expect(new Set(methods)).toEqual(new Set(["GET"]));
    expect(src).not.toMatch(/body:/);
  });

  it("calls only the read endpoints", () => {
    expect(src).not.toMatch(/batchUpdate|values:append|values:update|values:batchUpdate|:clear|batchClear|\/copy|\/permissions|developerMetadata|\/revisions/);
    const urls = [...src.matchAll(/`\$\{(SHEETS_API|DRIVE_FILES)\}([^`]*)`/g)].map((m) => `${m[1]}${m[2]}`);
    for (const u of urls) expect(u, u).toMatch(/^(SHEETS_API\/\$\{PT_SHEET_FILE_ID\}(\/values:batchGet|\?fields=sheets\.properties\(title,sheetId\))|DRIVE_FILES\/\$\{PT_SHEET_FILE_ID\}\?fields=)/);
  });

  it("requests ranges only through the allowlist", () => {
    expect(src).toMatch(/rangesFor\(/);
    expect(src).not.toMatch(/ranges",\s*["'`]/);
  });

  it("leaves Drive's write module and the sheet id apart", () => {
    const writes = readFileSync(join(here, "../drive/writes.ts"), "utf8");
    expect(writes).not.toMatch(/pt-sheet|PT_SHEET/);
  });
});

describe("no Google file picker anywhere in the app", () => {
  // drive.file would grant write access to any file a user picks through a Google Picker. The app has none.
  const root = join(here, "..", "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx)$/.test(name) && !p.endsWith("guard.test.ts")) files.push(p);
    }
  };
  walk(root);

  it("never loads the Picker API", () => {
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/google\.picker|apis\.google\.com\/js\/api|PickerBuilder|gapi\.load\(\s*["']picker/);
  });
});
