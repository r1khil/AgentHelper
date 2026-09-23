import { describe, expect, it } from "vitest";
import { gazeFor, type Attention } from "./attention";

// A 64px Hoot in the bottom-right of a 1280×800 window.
const rect = { left: 1196, top: 716, width: 64, height: 64 } as DOMRect;
const at = (target: Attention["target"], secret = false): Attention => ({ target, secret });

describe("gazeFor", () => {
  it("looks straight ahead at rest", () => {
    expect(gazeFor(at({ kind: "rest" }), rect)).toEqual({ x: 0, y: 0 });
  });

  it("points toward a far target at full reach, a near one only a little", () => {
    const far = gazeFor(at({ kind: "point", x: 100, y: 100 }), rect);
    expect(far.x).toBeLessThan(-0.8);
    expect(far.y).toBeLessThan(-0.4);
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(1, 5);
    const near = gazeFor(at({ kind: "point", x: 1228 + 26, y: 747 }), rect);
    expect(near.x).toBeCloseTo(0.1, 1);
  });

  it("passes directions through and looks away for passwords", () => {
    expect(gazeFor(at({ kind: "dir", x: 0, y: 0.8 }), rect)).toEqual({ x: 0, y: 0.8 });
    const away = gazeFor(at({ kind: "point", x: 1500, y: 700 }, true), rect);
    expect(away.x).toBeLessThan(0);
    expect(away.y).toBeGreaterThan(0);
  });
});
