import { describe, expect, it } from "vitest";
import { isCallTitle, threadTitle } from "./thread-title";

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
