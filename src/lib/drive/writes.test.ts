import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guard: the Drive write surface stays additive. If this test fails, someone widened what the app can do to the
 * admin's Drive; that is a product decision, not a refactor.
 */
const here = new URL(".", import.meta.url).pathname;
const read = (f: string) => readFileSync(`${here}${f}`, "utf8");
const exportedNames = (src: string) => [...src.matchAll(/^export (?:async )?function (\w+)/gm)].map((m) => m[1]).sort();

describe("Drive write surface", () => {
  it("writes.ts exports only create-folder, upload, replace-own-file, and the folder helper", () => {
    expect(exportedNames(read("writes.ts"))).toEqual(["ensureFolder", "ensureHoldingFolders", "updateAppFileContent", "uploadFile"]);
  });

  it("read.ts only reads", () => {
    const src = read("read.ts");
    expect(exportedNames(src)).toEqual(["about", "downloadFile", "escapeQuery", "exportFile", "findChildFolder", "getFile", "listChildren", "searchFullText"]);
    expect(src).not.toMatch(/method:\s*"(POST|PATCH|PUT|DELETE)"/);
  });

  it("no module deletes, trashes, moves, or shares", () => {
    for (const f of ["auth.ts", "http.ts", "read.ts", "writes.ts", "index.ts", "extract.ts", "mirror.ts"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/method:\s*"DELETE"/);
      expect(src, f).not.toMatch(/\/trash|emptyTrash|\/permissions|"trashed":\s*true|removeParents|addParents/);
    }
  });

  it("refuses to replace a file the app did not create", () => {
    expect(read("writes.ts")).toMatch(/if \(!row\.createdByApp\) throw/);
  });
});
