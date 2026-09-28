/**
 * A value axis on round numbers: a few ticks on a 1, 2, 2.5 or 5 step (times a power of ten), and how many decimals
 * those ticks need, so a formatter never rounds two ticks to the same label ("(1%)", "(1%)") or skips one
 * ("0.2%, 0.3%, 0.5%").
 */
export type NiceScale = { ticks: number[]; domain: [number, number]; digits: number };

const STEPS = [1, 2, 2.5, 5];
/** How far past the data (a share of its range) an "inner" tick may sit. */
const SLACK = 0.15;

/**
 * Ticks for data from `lo` to `hi`, at most `max` of them.
 * - "inner" (the default): three to `max` ticks inside the data (or just past its ends) and a domain that hugs the
 *   data, so the line keeps the plot's height; a 0 inside the data is always a tick. Falls back to "cover" in the rare
 *   range where no step gives three or more.
 * - "cover": the ticks cover the data and the domain runs from the first tick to the last. A small dip below 0 can
 *   cost a quarter of the plot (0% to 43% becomes (25%) to 50%), hence not the default.
 */
export function niceScale(lo: number, hi: number, max = 4, { fit = "inner" }: { fit?: "cover" | "inner" } = {}): NiceScale | null {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) {
    // A flat line: a small band around it.
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.01;
    [lo, hi] = [lo - pad, hi + pad];
  }
  const count = Math.max(2, max);
  const range = hi - lo;
  const exp = Math.floor(Math.log10(range / (count - 1)));
  if (fit === "inner") {
    // Ticks inside the data first; failing that, one may sit a little past either end (the domain stretches to it).
    for (let e = exp - 1; e <= exp + 1; e++) {
      for (const m of STEPS) {
        const step = m * 10 ** e;
        for (const slack of [0, range * SLACK]) {
          const first = Math.ceil((lo - slack) / step - 1e-9);
          const last = Math.floor((hi + slack) / step + 1e-9);
          const n = last - first + 1;
          if (n < Math.min(3, count) || n > count) continue;
          const ticks: number[] = [];
          for (let k = first; k <= last; k++) ticks.push(clean(k * step));
          return { ticks, domain: [Math.min(lo, ticks[0]), Math.max(hi, ticks.at(-1)!)], digits: Math.max(0, -e + (m === 2.5 ? 1 : 0)) };
        }
      }
    }
  }
  for (let e = exp; e <= exp + 2; e++) {
    for (const m of STEPS) {
      const step = m * 10 ** e;
      const first = Math.floor(lo / step + 1e-9);
      const last = Math.ceil(hi / step - 1e-9);
      if (last - first + 1 > count) continue;
      const ticks: number[] = [];
      for (let k = first; k <= last; k++) ticks.push(clean(k * step));
      // 2.5 needs one decimal more than its power of ten; whole steps need none.
      const digits = Math.max(0, -e + (m === 2.5 ? 1 : 0));
      return { ticks, domain: [ticks[0], ticks.at(-1)!], digits };
    }
  }
  return null;
}

/** Floating-point noise off a tick: 3 * 0.1 is 0.30000000000000004; -0 is 0. */
const clean = (v: number) => Number(v.toPrecision(12)) + 0;
