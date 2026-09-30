/** Endpoint math for raw prices, cumulative percent returns, or percentage-point levels. */
export function intervalChange(
  first: unknown,
  last: unknown,
  kind: "price" | "return" | "level",
) {
  if (
    typeof first !== "number" ||
    typeof last !== "number" ||
    !Number.isFinite(first) ||
    !Number.isFinite(last)
  )
    return { change: null, returnPct: null };
  const base = kind === "return" ? 100 + first : first;
  const end = kind === "return" ? 100 + last : last;
  return {
    change: last - first,
    returnPct: kind !== "level" && base > 0 ? (end / base - 1) * 100 : null,
  };
}

/** Nearest actual observation in plot pixels; also works on categorical dates and partial intraday sessions. */
export function nearestCoordinate(
  coordinates: (number | undefined)[],
  pixel: number,
): number | null {
  let best: number | null = null;
  let distance = Infinity;
  coordinates.forEach((x, index) => {
    if (x === undefined || !Number.isFinite(x)) return;
    const next = Math.abs(x - pixel);
    if (next < distance) {
      best = index;
      distance = next;
    }
  });
  return best;
}
