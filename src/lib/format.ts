/*
 * The app's one set of display formats. Every figure a reader sees goes through here, so a number reads the same on
 * Today, Holdings, Attribution, Risk, Research, Weekly, in Hoot's copy and in email.
 *
 * Numbers use accounting style: negatives in parentheses with the unit inside ("(0.29%)", "(2 bp)", "($1,234.50)"),
 * no plus sign on positives, and a value that rounds to zero is never negative. Returns and weights are in percent;
 * relative figures (fund vs benchmark, contribution, active weight, a movement's move against the S&P) are in basis
 * points, always written "bp". Direction is shown by color, which callers choose separately.
 *
 * Dates have one format per level of detail, all in New York time: "Mon 28 Sep" for a day this year, "28 Sep 2026"
 * for a full date or one in another year, "12:00 ET" for a time (24-hour, no seconds) and "Mon 28 Sep, 12:00 ET"
 * for both. A bare "YYYY-MM-DD" is a calendar date and is never shifted by a time zone.
 */

type Num = number | string | null | undefined;

const DASH = "—";

function toNumber(n: Num): number | null {
  if (n === null || n === undefined || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

/** `n.toFixed(digits)`, except that a value which rounds to zero reads "0.00", never "-0.00". For inputs and working, not display. */
export function fixed(n: number, digits = 2) {
  const s = n.toFixed(digits);
  return Number(s) === 0 ? (0).toFixed(digits) : s;
}

/** Thousands separators and exactly `digits` decimals, no sign. */
function grouped(abs: number, digits: number, maxDigits = digits) {
  return abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: maxDigits });
}

/** Wrap a formatted magnitude in parentheses when the value is negative and does not round to zero. */
function signWrap(v: number, body: string) {
  return v < 0 && /[1-9]/.test(body) ? `(${body})` : body;
}

/**
 * The shared primitive. Accounting style: negatives in parentheses, no plus sign, thousands grouped. The unit goes
 * inside the parentheses, so -0.29 with "%" reads "(0.29%)". A value that rounds to zero is never negative, and a
 * missing or non-numeric value is "—".
 */
export function fmtAccounting(n: Num, digits = 2, unit = "") {
  const v = toNumber(n);
  if (v === null) return DASH;
  return signWrap(v, `${grouped(Math.abs(v), digits)}${unit}`);
}

/** A return or weight already in percent: 1.234 → "1.23%", -0.5 → "(0.50%)". */
export function fmtPct(n: Num, digits = 2) {
  return fmtAccounting(n, digits, "%");
}

/** A relative figure already in basis points: -2 → "(2 bp)", 25 → "25 bp". Always "bp", never "bps". */
export function fmtBp(n: Num, digits = 0) {
  return fmtAccounting(n, digits, " bp");
}

/** Percentage points to basis points (1 pp = 100 bp), keeping a missing value missing. */
export function ppToBp(pp: Num): number | null {
  const v = toNumber(pp);
  return v === null ? null : v * 100;
}

/** A plain amount with no symbol: -1234.5 → "(1,234.50)". */
export function fmtMoney(n: Num, digits = 2) {
  return fmtAccounting(n, digits);
}

/** US dollars: 1234.5 → "$1,234.50", -12 → "($12.00)". */
export function fmtUsd(n: Num, digits = 2) {
  return fmtCurrency(n, "USD", { digits });
}

/** Compact: 1500 → "1.5K", -2.4e6 → "(2.4M)". */
export function fmtCompact(n: Num) {
  const v = toNumber(n);
  if (v === null) return DASH;
  return signWrap(v, Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(v)));
}

/** Compact US dollars: 1.2e6 → "$1.2M", -45000 → "($45K)". */
export function fmtUsdCompact(n: Num) {
  const v = toNumber(n);
  if (v === null) return DASH;
  const body = Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(v));
  return signWrap(v, `$${body}`);
}

/** A count or plain value (shares, a model cell), up to `maxDigits` decimals and only as many as it has: 1200 → "1,200", 3.5 → "3.5", -2 → "(2)". */
export function fmtNumber(n: Num, maxDigits = 4) {
  const v = toNumber(n);
  if (v === null) return DASH;
  return signWrap(v, grouped(Math.abs(v), 0, maxDigits));
}

/**
 * A provider's money figure in its own currency, accounting style: "$4.46" for USD, the ISO code for any other
 * ("TWD 1,454.94B"), and no symbol when the currency is unknown, since a wrong "$" is worse than none. `scale`
 * divides first and `suffix` names it (1e9 and "B"); `maxDigits` allows more decimals when the figure has them (a
 * ticket price of $280.1234). Negatives go in parentheses; a zero is never "(0.00)".
 */
export function fmtCurrency(n: Num, currency: string | null | undefined, { digits = 2, maxDigits, scale = 1, suffix = "" }: { digits?: number; maxDigits?: number; scale?: number; suffix?: string } = {}) {
  const raw = toNumber(n);
  if (raw === null) return DASH;
  const v = raw / scale;
  const code = currency?.trim().toUpperCase();
  return signWrap(v, `${!code ? "" : code === "USD" ? "$" : `${code} `}${grouped(Math.abs(v), digits, Math.max(digits, maxDigits ?? digits))}${suffix}`);
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
