import { describe, expect, it } from "vitest";
import { markScopeIntent, takeScopeIntent } from "./scope-intent";

describe("scope intent", () => {
  it("covers the next scope change only", () => {
    markScopeIntent(1_000);
    expect(takeScopeIntent(1_500)).toBe(true);
    expect(takeScopeIntent(1_600)).toBe(false);
  });
  it("expires when no navigation follows", () => {
    markScopeIntent(1_000);
    expect(takeScopeIntent(20_000)).toBe(false);
  });
  it("is off until marked", () => {
    expect(takeScopeIntent(5_000)).toBe(false);
  });
});
