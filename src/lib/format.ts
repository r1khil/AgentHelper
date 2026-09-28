/** `n.toFixed(digits)`, except that a value which rounds to zero reads "0.00", never "-0.00". */
export function fixed(n: number, digits = 2) {
  const s = n.toFixed(digits);
  return Number(s) === 0 ? (0).toFixed(digits) : s;
}

// signDisplay "negative" drops the minus from a value that rounds to zero ("0.00", not "-0.00").
export function fmtMoney(n: number | string | null | undefined, digits = 2) {
  if (n === null || n === undefined || n === "") return "";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits, signDisplay: "negative" });
}

export function fmtPct(n: number | string | null | undefined, digits = 2, signed = true) {
  if (n === null || n === undefined || n === "") return "";
  const s = fixed(Number(n), digits);
  return `${signed && Number(s) > 0 ? "+" : ""}${s}%`;
}

export function fmtCompact(n: number | null | undefined) {
  if (n === null || n === undefined) return "";
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1, signDisplay: "negative" }).format(n);
}

/**
 * A provider's money figure in its own currency, accounting style: "$4.46" for USD, the ISO code for any other
 * ("TWD 1,454.94B"), and no symbol when the currency is unknown, since a wrong "$" is worse than none. `scale`
 * divides first and `suffix` names it (1e9 and "B"). Negatives go in parentheses; a zero is never "(0.00)".
 */
export function fmtCurrency(n: number | string | null | undefined, currency: string | null | undefined, { digits = 2, scale = 1, suffix = "" } = {}) {
  if (n === null || n === undefined || n === "" || !Number.isFinite(Number(n))) return "—";
  const v = Number(n) / scale;
  const body = fmtMoney(Math.abs(v), digits);
  const code = currency?.trim().toUpperCase();
  const text = `${!code ? "" : code === "USD" ? "$" : `${code} `}${body}${suffix}`;
  return v < 0 && Number(body.replaceAll(",", "")) !== 0 ? `(${text})` : text;
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d.length === 10 ? `${d}T12:00:00Z` : d) : d;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
}

export function relativeTime(d: string | Date | null | undefined) {
  if (!d) return "";
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(new Date(t));
}

/**
 * Accounting style: negatives in parentheses, no plus sign on positives. The unit goes inside the
 * parentheses, so -0.29 with "%" reads "(0.29%)". A value that rounds to zero is never negative.
 */
export function fmtAccounting(n: number | null | undefined, digits = 2, unit = "") {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const body = `${Math.abs(n).toFixed(digits)}${unit}`;
  return n < 0 && Number(body.replace(unit, "")) !== 0 ? `(${body})` : body;
}
