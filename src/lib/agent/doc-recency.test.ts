import { describe, expect, it } from "vitest";
import { dateFromName, effectiveDate, passageCoverage, pickNewest } from "./doc-recency";

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

describe("document dates", () => {
  it("reads the date written in a file name", () => {
    expect(dateFromName("KKR_4Q_25 Earnings Deck (05-Feb-2026).pdf")).toBe("2026-02-05");
    expect(dateFromName("GOOG_2Q_20 Earnings Report (31-July-2020).pdf")).toBe("2020-07-31");
    expect(dateFromName("GOOG model.xlsx")).toBeNull();
  });
  it("prefers the stated date, then the name, then the modified time", () => {
    const publishedAt = new Date("2022-08-11T00:00:00Z");
    expect(effectiveDate({ kind: "drive", docDate: "2019-10-20", name: "x (23-Oct-2019).pdf", publishedAt })).toBe("2019-10-20");
    expect(effectiveDate({ kind: "drive", docDate: null, name: "GOOGL_3Q_19 Pre-Earnings Memo (23-Oct-2019).pdf", publishedAt })).toBe("2019-10-23");
    expect(effectiveDate({ kind: "drive", docDate: null, name: "notes.docx", publishedAt })).toBe("2022-08-11");
    expect(effectiveDate({ kind: "filing", docDate: "2026-06-30", name: "10-Q", publishedAt: "2026-07-24T12:00:00Z" })).toBe("2026-07-24");
  });
});
