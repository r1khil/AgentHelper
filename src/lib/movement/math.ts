import { MOVEMENT_THRESHOLD_PP } from "@/lib/constants";

export function returnPct(close: number, prevClose: number) {
  return 100 * (close / prevClose - 1);
}

export function relativeMovePp(holding: { close: number; prevClose: number }, spx: { close: number; prevClose: number }) {
  return returnPct(holding.close, holding.prevClose) - returnPct(spx.close, spx.prevClose);
}

/** Inclusive boundary at 4.0 percentage points, either direction. Rounded to 4dp first so 3.99996 does not qualify by float noise. */
export function qualifies(relativePp: number, threshold = MOVEMENT_THRESHOLD_PP) {
  const r = Math.round(relativePp * 10000) / 10000;
  return Math.abs(r) >= threshold;
}
