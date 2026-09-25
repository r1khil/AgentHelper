import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("server-only", () => ({}));

const calls = vi.hoisted(() => ({ values: null as unknown, conflict: null as unknown }));
vi.mock("@/db/client", () => ({
  db: {
    insert: () => ({
      values: (v: unknown) => {
        calls.values = v;
        return {
          onConflictDoUpdate: (c: unknown) => {
            calls.conflict = c;
            return { returning: async () => [{ value: "7" }] };
          },
        };
      },
    }),
  },
}));

import { appSettings } from "@/db/schema";
import { countSandboxRun, runCounterKey } from "./quota";

describe("countSandboxRun", () => {
  it("increments the member's counter for the day in one upsert and returns the total", async () => {
    await expect(countSandboxRun("user-1", "2026-09-25")).resolves.toBe(7);
    expect(calls.values).toEqual({ key: "sandbox_runs:user-1:2026-09-25", value: "1", updatedBy: "user-1" });
    const c = calls.conflict as { target: unknown; set: { value: SQL } };
    expect(c.target).toBe(appSettings.key);
    const q = new PgDialect().sqlToQuery(c.set.value);
    expect(q.sql).toBe(`(coalesce(nullif("app_settings"."value", ''), '0')::int + 1)::text`);
  });

  it("keys counters by member and New York day", () => {
    expect(runCounterKey("u", "2026-01-02")).toBe("sandbox_runs:u:2026-01-02");
  });
});
