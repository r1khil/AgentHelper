import { describe, expect, it } from "vitest";
import { gazeToward, padded, placeBeside, placeCenter } from "./placement";

const view = { width: 1440, height: 900 };
const card = { width: 360, height: 240 };

describe("placeBeside", () => {
  it("perches to the right of a menu item, Hoot nearest it", () => {
    const p = placeBeside({ x: 12, y: 300, width: 216, height: 32 }, 64, card, view);
    expect(p.side).toBe("right");
    expect(p.hoot).toEqual({ x: 12 + 216 + 14, y: 300 });
    expect(p.card.x).toBe(p.hoot.x + 64 + 8);
  });

  it("keeps the card on screen for an item near the bottom", () => {
    const p = placeBeside({ x: 12, y: 850, width: 216, height: 32 }, 64, card, view);
    expect(p.card.y + card.height).toBeLessThanOrEqual(view.height - 16);
  });

  it("goes below a wide section when the right side is full", () => {
    const p = placeBeside({ x: 280, y: 100, width: 1100, height: 200 }, 64, card, view);
    expect(p.side).toBe("below");
    expect(p.hoot.y).toBe(314);
  });

  it("goes above when there's no room below", () => {
    const p = placeBeside({ x: 280, y: 560, width: 1100, height: 300 }, 64, card, view);
    expect(p.side).toBe("above");
    expect(p.card.y + card.height).toBeLessThanOrEqual(560);
  });

  it("falls back to the corner for a section taller than the screen", () => {
    const p = placeBeside({ x: 280, y: 20, width: 1100, height: 2000 }, 64, card, view);
    expect(p.side).toBe("corner");
    expect(p.card.x + card.width).toBeLessThanOrEqual(view.width - 16);
    expect(p.card.y + card.height).toBeLessThanOrEqual(view.height - 16);
  });
});

describe("placeCenter", () => {
  it("stacks Hoot over his card in the middle", () => {
    const p = placeCenter(112, card, view);
    expect(p.hoot.x + 56).toBe(720);
    expect(p.card.x + 180).toBe(720);
    expect(p.card.y).toBe(p.hoot.y + 112 + 12);
  });
});

describe("gazeToward and padded", () => {
  it("looks left at a menu item from its right", () => {
    const g = gazeToward({ x: 300, y: 300 }, 64, { x: 12, y: 316, width: 216, height: 32 });
    expect(g.x).toBeLessThan(-0.9);
  });

  it("grows a box without leaving the screen", () => {
    expect(padded({ x: 2, y: 100, width: 50, height: 50 }, 8, view)).toEqual({ x: 4, y: 92, width: 56, height: 66 });
  });
});
