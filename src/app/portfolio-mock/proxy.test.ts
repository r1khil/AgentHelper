import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getClaims: async () => ({ data: { claims: null } }) },
  })),
}));
import { createServerClient } from "@supabase/ssr";
import { proxy } from "@/proxy";

const expectLogin = (response: Response) => {
  expect(response.status).toBe(307);
  expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
};

describe("synthetic portfolio mock authentication boundary", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("serves only the exact standalone mock, in development behind its flag, without reading a session", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PORTFOLIO_MOCK_PREVIEW", "1");
    const response = await proxy(
      new NextRequest("http://localhost/portfolio-mock"),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("keeps the mock authenticated in production or without the flag", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PORTFOLIO_MOCK_PREVIEW", "1");
    expectLogin(
      await proxy(new NextRequest("http://localhost/portfolio-mock")),
    );
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PORTFOLIO_MOCK_PREVIEW", "");
    expectLogin(
      await proxy(new NextRequest("http://localhost/portfolio-mock")),
    );
  });

  it("keeps live portfolio routes, APIs, and similar paths authenticated", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PORTFOLIO_MOCK_PREVIEW", "1");
    for (const pathname of [
      "/t/fund",
      "/t/fund/risk",
      "/t/fund/exposure",
      "/api/backtesting",
      "/api/risk/export",
      "/portfolio-mock/extra",
    ]) {
      expectLogin(await proxy(new NextRequest(`http://localhost${pathname}`)));
    }
    expect(createServerClient).toHaveBeenCalledTimes(6);
  });
});
