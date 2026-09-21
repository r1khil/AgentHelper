import { describe, expect, it } from "vitest";
import { capPerDocument, rrfFuse } from "./fusion";

const item = (key: string) => ({ key });

describe("rrfFuse", () => {
  it("ranks a candidate present in both lists above one that tops a single list", () => {
    const vector = [item("a"), item("b"), item("c")];
    const text = [item("d"), item("b"), item("e")];
    const fused = rrfFuse([vector, text]);
    expect(fused[0].key).toBe("b");
    expect(fused.map((f) => f.key)).toHaveLength(5);
    expect(fused[0].fused).toBeCloseTo(1 / 62 + 1 / 62);
  });
  it("keeps first-list order on ties and tolerates empty lists", () => {
    expect(rrfFuse([[item("x"), item("y")], []]).map((f) => f.key)).toEqual(["x", "y"]);
    expect(rrfFuse([[], []])).toEqual([]);
  });
});

describe("capPerDocument", () => {
  it("limits hits per document and overall while preserving order", () => {
    const hits = [
      { documentId: "d1", seq: 0 },
      { documentId: "d1", seq: 1 },
      { documentId: "d1", seq: 2 },
      { documentId: "d2", seq: 0 },
      { documentId: "d3", seq: 0 },
    ];
    expect(capPerDocument(hits, 2, 10)).toEqual([hits[0], hits[1], hits[3], hits[4]]);
    expect(capPerDocument(hits, 2, 3)).toEqual([hits[0], hits[1], hits[3]]);
  });
});
