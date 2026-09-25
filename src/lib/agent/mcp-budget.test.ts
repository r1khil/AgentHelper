import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

vi.mock("server-only", () => ({}));
// An in-memory Postgres (PGlite) stands in for the database, so the real upsert runs; nothing leaves the process.
vi.mock("@/db/client", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  return { db: drizzle(new PGlite()) };
});

import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { clearSettingsMemo } from "@/lib/settings";
import { budgetExhaustedMessage, claimMcpCall, mcpBudgets, mcpCapKey, mcpCountKey, parseCap, utcDay } from "./mcp-budget";

async function put(key: string, value: string) {
  await db.execute(sql`insert into app_settings (key, value) values (${key}, ${value}) on conflict (key) do update set value = excluded.value`);
}
async function get(key: string) {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key));
  return row?.value ?? null;
}

beforeAll(async () => {
  await db.execute(sql`create table app_settings (key text primary key, value text not null, updated_by uuid, updated_at timestamptz not null default now())`);
});
beforeEach(async () => {
  await db.execute(sql`delete from app_settings`);
  clearSettingsMemo();
});

describe("parseCap", () => {
  it("accepts whole numbers and treats blank or junk as no cap", () => {
    expect(parseCap("20")).toBe(20);
    expect(parseCap("0")).toBe(0);
    expect(parseCap("")).toBeNull();
    expect(parseCap(null)).toBeNull();
    expect(parseCap("2.5")).toBeNull();
    expect(parseCap("-1")).toBeNull();
    expect(parseCap("lots")).toBeNull();
  });
  it("keys the counter by UTC day", () => {
    expect(utcDay(new Date("2026-09-25T23:30:00-07:00"))).toBe("2026-09-26");
    expect(mcpCountKey("Alpha Vantage", "2026-09-25")).toBe("mcp_calls:Alpha Vantage:2026-09-25");
  });
});

describe("claimMcpCall", () => {
  it("does not count a server with no cap", async () => {
    expect(await claimMcpCall("Free")).toEqual({ ok: true });
    expect(await get(mcpCountKey("Free"))).toBeNull();
  });
  it("counts up to the cap and then refuses without going past it", async () => {
    await put(mcpCapKey("AV"), "3");
    const results = await Promise.all(Array.from({ length: 5 }, () => claimMcpCall("AV")));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, cap: 3 }, { ok: false, cap: 3 }]);
    expect(await get(mcpCountKey("AV"))).toBe("3");
  });
  it("refuses every call when the cap is 0", async () => {
    await put(mcpCapKey("Off"), "0");
    expect(await claimMcpCall("Off")).toEqual({ ok: false, cap: 0 });
    expect(await get(mcpCountKey("Off"))).toBeNull();
  });
  it("starts fresh each UTC day and drops earlier days' counters", async () => {
    await put(mcpCapKey("AV"), "2");
    await put(mcpCountKey("AV", "2020-01-01"), "2");
    await put(mcpCountKey("Other", "2020-01-01"), "7");
    expect(await claimMcpCall("AV")).toEqual({ ok: true });
    await vi.waitFor(async () => expect(await get(mcpCountKey("AV", "2020-01-01"))).toBeNull());
    expect(await get(mcpCountKey("Other", "2020-01-01"))).toBe("7");
    expect(await get(mcpCountKey("AV"))).toBe("1");
  });
  it("lets the call through when the counter cannot be read", async () => {
    await put(mcpCapKey("AV"), "2");
    await put(mcpCountKey("AV"), "not a number");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await claimMcpCall("AV")).toEqual({ ok: true });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("mcpBudgets", () => {
  it("reports cap and today's use per server", async () => {
    await put(mcpCapKey("AV"), "20");
    await put(mcpCountKey("AV"), "4");
    expect(await mcpBudgets(["AV", "Free"])).toEqual({ AV: { cap: 20, used: 4 }, Free: { cap: null, used: 0 } });
  });
  it("words the exhausted message for the model", () => {
    expect(budgetExhaustedMessage("Alpha Vantage", 20)).toBe("Daily budget for Alpha Vantage is used up (20 calls); try again tomorrow or use a native tool");
  });
});
