import { describe, expect, it } from "vitest";
import { passageCoverage, pickNewest } from "./doc-recency";

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

describe("pickNewest", () => {
  const c = (id: string, kind: "drive" | "filing", date: string | null, label: string | null = null) => ({ id, kind, date, label });
  it("keeps a same-day filing package together", () => {
    const rows = [c("ex992", "filing", "2026-07-24"), c("ex991", "filing", "2026-07-24"), c("q2", "filing", "2026-04-25")];
    expect(pickNewest(rows, 1)).toEqual(["ex992", "ex991"]);
  });
  it("skips excluded and unwanted Drive document types", () => {
    const rows = [c("mm", "drive", "2025-05-07", "Major movement"), c("pre", "drive", "2025-04-20", "Pre-earnings"), c("upd", "drive", "2025-02-05", "Earnings update")];
    expect(pickNewest(rows, 1, { excludeLabels: ["Major movement"] })).toEqual(["pre"]);
    expect(pickNewest(rows, 1, { labels: ["Earnings update"] })).toEqual(["upd"]);
    expect(pickNewest(rows, 2)).toEqual(["mm", "pre"]);
  });
});
