import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The auth proxy lets any path starting with /not-invited through without a session (src/proxy.ts), which is handy
// for a no-login scratch preview while building. None may ship: the only such page is (auth)/not-invited.
describe("no-login scratch routes", () => {
  it("are never committed", () => {
    const top = readdirSync(path.resolve(import.meta.dirname), { withFileTypes: true }).filter((d) => d.isDirectory() && d.name.startsWith("not-invited"));
    expect(top.map((d) => d.name)).toEqual([]);
  });
});
