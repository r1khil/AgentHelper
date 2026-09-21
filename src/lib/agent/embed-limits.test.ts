import { describe, expect, it } from "vitest";
import { parseTokenLimit, shrinkInputs } from "./embed-limits";

describe("parseTokenLimit", () => {
  it("reads the provider's measured length and cap", () => {
    const msg = 'Embeddings endpoint returned 422: {"error":{"message":"HTTP 422: {\\"object\\":\\"error\\",\\"message\\":\\"input length 4533 exceeds model maximum 4096; set truncate=END or START to truncate long inputs\\"}"}}';
    expect(parseTokenLimit(msg)).toEqual({ length: 4533, max: 4096 });
  });

  it("ignores other errors and nonsensical numbers", () => {
    expect(parseTokenLimit("Embeddings endpoint returned 400: bad input")).toBeNull();
    expect(parseTokenLimit("input length 100 exceeds model maximum 4096")).toBeNull();
  });
});

describe("shrinkInputs", () => {
  it("cuts every input by the reported ratio with a margin", () => {
    const out = shrinkInputs(["a".repeat(1000), "b".repeat(100)], { length: 4533, max: 4096 });
    expect(out[0].length).toBe(Math.floor(1000 * (4096 / 4533) * 0.9));
    expect(out[1].length).toBe(Math.floor(100 * (4096 / 4533) * 0.9));
  });

  it("never returns an empty input and never grows one", () => {
    const out = shrinkInputs(["ab", "x".repeat(50)], { length: 5000, max: 4096 });
    expect(out[0].length).toBeGreaterThanOrEqual(1);
    expect(out[1].length).toBeLessThan(50);
  });
});
