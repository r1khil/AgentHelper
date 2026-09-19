import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/economic-calendar/service", () => ({
  CalendarNotConfigured: class extends Error {},
  getEconomicCalendar: vi.fn(),
}));
import { getCurrentUser } from "@/lib/auth";
import {
  CalendarNotConfigured,
  getEconomicCalendar,
} from "@/lib/economic-calendar/service";
import { GET } from "./route";
const user = { onboardedAt: new Date() } as Awaited<
  ReturnType<typeof getCurrentUser>
>;
const request = () =>
  new Request(
    "http://localhost/api/economic-calendar?from=2026-09-21&to=2026-09-27",
  );
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(user);
});
describe("economic calendar API", () => {
  it("requires authentication before provider access", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(getEconomicCalendar).not.toHaveBeenCalled();
  });
  it("validates ranges before provider access", async () => {
    expect(
      (
        await GET(
          new Request("http://localhost/api/economic-calendar?from=bad"),
        )
      ).status,
    ).toBe(400);
    expect(getEconomicCalendar).not.toHaveBeenCalled();
  });
  it("returns provider events unchanged with private no-store caching", async () => {
    const feed = {
      from: "2026-09-21",
      to: "2026-09-27",
      mode: "live" as const,
      provider: "test",
      fetchedAt: "2026-09-21T00:00:00Z",
      events: [],
    };
    vi.mocked(getEconomicCalendar).mockResolvedValue(feed);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(feed);
    expect(getEconomicCalendar).toHaveBeenCalledWith({
      from: feed.from,
      to: feed.to,
    });
  });
  it("reports missing configuration instead of silently substituting fixtures", async () => {
    vi.mocked(getEconomicCalendar).mockRejectedValue(
      new CalendarNotConfigured("Not connected"),
    );
    expect((await GET(request())).status).toBe(503);
  });
  it("does not leak provider errors or credentials", async () => {
    vi.mocked(getEconomicCalendar).mockRejectedValue(
      new Error("secret-api-key"),
    );
    const response = await GET(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret-api-key");
  });
});
