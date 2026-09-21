import { describe, expect, it } from "vitest";
import { safeWebUrl } from "./web";

describe("safeWebUrl", () => {
  it("accepts ordinary public pages", () => {
    const r = safeWebUrl("https://www.reuters.com/business/finance/amex-q2-2026/");
    expect(r.ok).toBe(true);
  });
  it("refuses non-http schemes, credentials and private addresses", () => {
    expect(safeWebUrl("ftp://example.com/x").ok).toBe(false);
    expect(safeWebUrl("javascript:alert(1)").ok).toBe(false);
    expect(safeWebUrl("https://user:pw@example.com/").ok).toBe(false);
    for (const h of ["http://localhost:3000/", "http://127.0.0.1/", "http://10.1.2.3/", "http://172.20.0.1/", "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://metadata.internal/", "http://box.local/"]) {
      expect(safeWebUrl(h).ok, h).toBe(false);
    }
  });
  it("refuses the app host and EDGAR archives", () => {
    expect(safeWebUrl("https://owlfund-workspace.vercel.app/t/fig", "owlfund-workspace.vercel.app").ok).toBe(false);
    const r = safeWebUrl("https://www.sec.gov/Archives/edgar/data/4962/x.htm");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("read_filing");
    expect(safeWebUrl("https://www.sec.gov/newsroom/press-releases/2026-1").ok).toBe(true);
  });
  it("rejects garbage", () => {
    expect(safeWebUrl("not a url").ok).toBe(false);
  });
});
