/** Where Hoot perches and where his card sits, for a highlighted box. Pure, so it's unit-tested. */

export type Box = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Placement = { hoot: { x: number; y: number }; card: { x: number; y: number }; side: "right" | "below" | "above" | "left" | "corner" | "center" };

export const EDGE = 16;
const GAP = 14;
/** Hoot and his card sit side by side, Hoot nearest the thing he's talking about. */
const BESIDE = 8;

/**
 * Tries the right of the target, then below, above and left; if nothing fits (a section taller than the screen),
 * Hoot and the card sit in the bottom-right corner over the page.
 */
export function placeBeside(target: Box, hootSize: number, card: Size, view: Size): Placement {
  const blockW = hootSize + BESIDE + card.width;
  const blockH = Math.max(card.height, hootSize);
  const clampX = (x: number) => Math.min(Math.max(x, EDGE), view.width - blockW - EDGE);
  const clampY = (y: number) => Math.min(Math.max(y, EDGE), view.height - blockH - EDGE);
  const at = (x: number, y: number, side: Placement["side"]): Placement => ({
    hoot: { x, y },
    card: { x: x + hootSize + BESIDE, y },
    side,
  });

  const right = target.x + target.width + GAP;
  if (right + blockW <= view.width - EDGE) return at(right, clampY(target.y), "right");

  const below = target.y + target.height + GAP;
  if (below + blockH <= view.height - EDGE) return at(clampX(target.x), below, "below");

  const above = target.y - GAP - blockH;
  if (above >= EDGE) return at(clampX(target.x), above, "above");

  const left = target.x - GAP - blockW;
  if (left >= EDGE) return at(left, clampY(target.y), "left");

  return at(view.width - blockW - EDGE - 8, view.height - blockH - EDGE - 8, "corner");
}

/** Hoot above his card in the middle of the screen, for the questions at the start and the goodbye. */
export function placeCenter(hootSize: number, card: Size, view: Size): Placement {
  const top = Math.max(EDGE, (view.height - hootSize - 12 - card.height) / 2);
  return {
    hoot: { x: (view.width - hootSize) / 2, y: top },
    card: { x: (view.width - card.width) / 2, y: top + hootSize + 12 },
    side: "center",
  };
}

/** Which way Hoot should look (-1..1 each axis) to face a box from where he sits. */
export function gazeToward(from: { x: number; y: number }, hootSize: number, target: Box) {
  const cx = from.x + hootSize / 2;
  const cy = from.y + hootSize / 2;
  const dx = target.x + target.width / 2 - cx;
  const dy = target.y + target.height / 2 - cy;
  const d = Math.hypot(dx, dy) || 1;
  return { x: +(dx / d).toFixed(2), y: +((dy / d) * 0.8).toFixed(2) };
}

/** The box, grown by `pad` on each side and kept inside the screen. */
export function padded(r: Box, pad: number, view: Size): Box {
  const x = Math.max(4, r.x - pad);
  const y = Math.max(4, r.y - pad);
  const right = Math.min(view.width - 4, r.x + r.width + pad);
  const bottom = Math.min(view.height - 4, r.y + r.height + pad);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}
