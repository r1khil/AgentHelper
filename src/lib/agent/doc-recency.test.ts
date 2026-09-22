import { describe, expect, it } from "vitest";
import { passageCoverage } from "./doc-recency";

describe("passageCoverage", () => {
  it("says nothing for an empty result", () => {
    expect(passageCoverage([])).toBeUndefined();
  });
  it("suggests narrowing when passages span several dates", () => {
    const out = passageCoverage([
      { documentId: "a", documentDate: "2026-07-30" },
      { documentId: "b", documentDate: "2025-10-28" },
      { documentId: "a", documentDate: "2026-07-30" },
    ]);
    expect(out).toContain("2 documents, dated 2025-10-28 to 2026-07-30");
    expect(out).toContain("latest: 1");
  });
  it("drops the hint once the search was narrowed", () => {
    expect(passageCoverage([{ documentId: "a", documentDate: "2026-07-30" }], 1)).toBe("1 document, dated 2026-07-30.");
  });
});
