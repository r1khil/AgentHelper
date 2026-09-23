import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/providers/yahoo", () => ({ resolveCompany: vi.fn() }));
import { POST } from "./route";
import { getCurrentUser } from "@/lib/auth";
import { resolveCompany } from "@/lib/providers/yahoo";

const request = (ticker: string) => new Request("http://localhost/api/backtesting/ticker", {
  method: "POST", body: JSON.stringify({ ticker }),
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ onboardedAt: new Date() } as Awaited<ReturnType<typeof getCurrentUser>>);
});
it("requires authentication before resolving a company", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  expect((await POST(request("IBM"))).status).toBe(401);
  expect(resolveCompany).not.toHaveBeenCalled();
});
it("normalizes a ticker and returns the provider's recognized company", async () => {
  vi.mocked(resolveCompany).mockResolvedValue({ symbol: "IBM", name: "International Business Machines" });
  const response = await POST(request(" ibm "));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ ticker: "IBM", name: "International Business Machines" });
  expect(resolveCompany).toHaveBeenCalledWith("IBM");
});
it("rejects malformed and unrecognized tickers", async () => {
  expect((await POST(request("CASH"))).status).toBe(400);
  expect(resolveCompany).not.toHaveBeenCalled();
  vi.mocked(resolveCompany).mockResolvedValue(null);
  expect((await POST(request("XYZ"))).status).toBe(404);
});
it("reports a provider outage separately from an unknown ticker", async () => {
  vi.mocked(resolveCompany).mockRejectedValue(new Error("429"));
  const response = await POST(request("IBM"));
  expect(response.status).toBe(502);
  expect((await response.json()).error).toMatch(/unavailable/);
});
