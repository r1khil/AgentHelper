import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  values: [] as Record<string, unknown>[],
  fail: null as unknown,
}));
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => state.rows.shift() ?? [] }),
      }),
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        insert: () => ({
          values: (v: Record<string, unknown>) => {
            state.values.push(v);
            return {
              returning: async () => {
                if (state.fail) throw state.fail;
                return [{ id: "saved", ...v }];
              },
            };
          },
        }),
      }),
  },
}));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
  canAccessTeam: vi.fn(),
}));
import { getCurrentUser, canAccessTeam } from "@/lib/auth";
import { POST } from "./route";
const teamId = "11111111-1111-4111-8111-111111111111";
const holdingId = "22222222-2222-4222-8222-222222222222";
const other = {
  companyType: "other",
  teamId,
  companyName: "Snowflake",
  ticker: "snow",
  title: "Broker call",
};
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/sell-side", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [[{ id: teamId }]];
  state.values = [];
  state.fail = null;
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: "user",
    role: "admin",
  } as never);
  vi.mocked(canAccessTeam).mockReturnValue(true);
});
describe("team-owned calls with optional portfolio links", () => {
  it("saves a non-portfolio company and chat without creating a holding", async () => {
    const response = await post(other);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ticker: "SNOW",
      holdingId: null,
      title: "Snowflake · Broker call",
      teamId,
    });
    expect(state.values).toHaveLength(2);
    expect(state.values[0]).toMatchObject({ teamId, holdingId: null });
  });
  it("retains holding-based creation", async () => {
    state.rows.push([{ id: holdingId, teamId, ticker: "AMZN" }]);
    expect((await post({ companyType: "holding", holdingId, teamId, title: "Call" })).status).toBe(200);
    expect(state.values[1]).toMatchObject({ holdingId, ticker: "AMZN" });
  });
  it("does not allow a holding from another team", async () => {
    state.rows.push([{ id: holdingId, teamId: "different", ticker: "AMZN" }]);
    expect((await post({ companyType: "holding", holdingId, teamId, title: "Call" })).status).toBe(404);
    expect(state.values).toHaveLength(0);
  });
  it("authorizes the team before any lookup or creation", async () => {
    vi.mocked(canAccessTeam).mockReturnValue(false);
    expect((await post(other)).status).toBe(404);
    expect(state.rows).toHaveLength(1);
    expect(state.values).toHaveLength(0);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await post(other)).status).toBe(401);
  });
  it("reports a missing optional-company migration without disclosing database errors", async () => {
    state.fail = {
      cause: {
        code: "23502",
        column: "holding_id",
        detail: "private connection information",
      },
    };
    const response = await post(other);
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("workspace update");
    expect(body).not.toContain("private connection");
  });
});
