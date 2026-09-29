import { describe, expect, it } from "vitest";
import { clipTitle, isCallTitle, threadTitle } from "./thread-title";

describe("threadTitle", () => {
  it("reads a sell-side call's chat as a call brief, without dots", () => {
    expect(threadTitle("Call: RSG · Broker", "RSG")).toBe("Call brief: Broker");
    expect(threadTitle("Call: RSG · Broker")).toBe("Call brief: RSG, Broker");
    expect(threadTitle("Call: XYZ · Acme Corp · Q3 preview", null)).toBe("Call brief: XYZ, Acme Corp, Q3 preview");
    expect(isCallTitle("Call: RSG · Broker")).toBe(true);
  });
  it("leaves other titles alone", () => {
    expect(threadTitle("What moved META today?", "META")).toBe("What moved META today?");
    expect(isCallTitle("Call me about AVGO")).toBe(false);
  });
});

describe("clipTitle", () => {
  it("cuts a long question at a word, with an ellipsis", () => {
    const q = "Can you walk me through why the fund lagged the benchmark this quarter and explain the whole thing for me";
    const t = clipTitle(q);
    expect(t.length).toBeLessThanOrEqual(80);
    expect(t.endsWith("…")).toBe(true);
    expect(q.startsWith(t.slice(0, -1))).toBe(true);
    expect(q[t.length - 1]).toBe(" ");
  });
  it("leaves a short question whole", () => expect(clipTitle("  What moved   META? ")).toBe("What moved META?"));
  it("repairs a title saved mid-word at the old 80-character cut", () => {
    const saved = "Can you walk me through why the fund lagged the benchmark and explain the whole thing f".slice(0, 80);
    expect(saved).toHaveLength(80);
    expect(threadTitle(saved)).toMatch(/ the…$|[a-z]…$/);
    expect(threadTitle(saved).endsWith(" f…")).toBe(false);
  });
});
