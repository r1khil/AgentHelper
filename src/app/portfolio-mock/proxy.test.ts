import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getClaims: async () => ({ data: { claims: null } }) },
  })),
}));
import { createServerClient } from "@supabase/ssr";
import { proxy } from "@/proxy";

describe("synthetic portfolio mock authentication boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serves only the exact standalone mock without reading a session", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/portfolio-mock"),
    );
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("keeps live portfolio routes, APIs, and similar paths authenticated", async () => {
    for (const pathname of [
      "/t/fund",
      "/t/fund/risk",
      "/t/fund/exposure",
      "/api/backtesting",
      "/api/risk/export",
      "/portfolio-mock/extra",
    ]) {
      const response = await proxy(
        new NextRequest(`http://localhost${pathname}`),
      );
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("location")!).pathname).toBe(
        "/login",
      );
    }
    expect(createServerClient).toHaveBeenCalledTimes(6);
  });
});
