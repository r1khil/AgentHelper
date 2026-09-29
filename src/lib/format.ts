import { DateTime } from "luxon";

/*
 * The app's one set of display formats. Every figure a reader sees goes through here, so a number reads the same on
 * Today, Holdings, Attribution, Risk, Research, Weekly, in Hoot's copy and in email.
 *
 * Numbers use accounting style: negatives in parentheses with the unit inside ("(0.29%)", "(2 bp)", "($1,234.50)"),
 * and a value that rounds to zero is never negative. Levels (a weight, a price, a value) carry no sign; a change (a
 * return, a gain, a move against the benchmark) is written with a plus when it is up: "+0.39%", "+12 bp", "(1.42%)"
 * (the fmtChange* helpers). Returns and weights are in percent; relative figures (fund vs benchmark, contribution,
 * active weight, a movement's move against the S&P) are in basis points, always written "bp". Direction is also shown
 * by color, which callers choose separately.
 *
 * Dates have one format per level of detail, all in New York time: "Mon, Sep 28" for a day this year, "Sep 28, 2026"
 * for a full date or one in another year, "Sep 28" where the weekday and year are clear, "2:41 PM ET" for a time and
 * "Mon, Sep 28, 2:41 PM ET" for both. A bare "YYYY-MM-DD" is a calendar date and is never shifted by a time zone.
 */

type Num = number | string | null | undefined;

const DASH = "—";
const NY = "America/New_York";

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

/** A plus in front of a formatted change that is up (and does not round to zero). */
function plus(n: Num, body: string) {
  const v = toNumber(n);
  return v !== null && v > 0 && /[1-9]/.test(body) ? `+${body}` : body;
}

/** A return or move in percent: 0.39 → "+0.39%", -1.42 → "(1.42%)", 0 → "0.00%". */
export function fmtChangePct(n: Num, digits = 2) {
  return plus(n, fmtPct(n, digits));
}

/** A relative move in basis points: 12 → "+12 bp", -430 → "(430 bp)". */
export function fmtChangeBp(n: Num, digits = 0) {
  return plus(n, fmtBp(n, digits));
}

/** A gain or loss with no symbol: 3918.51 → "+3,918.51", -22092 → "(22,092.00)". */
export function fmtChangeMoney(n: Num, digits = 2) {
  return plus(n, fmtMoney(n, digits));
}

/** A gain or loss in dollars: 17294.21 → "+$17,294.21", -6.2 → "($6.20)". */
export function fmtChangeUsd(n: Num, digits = 2) {
  return plus(n, fmtUsd(n, digits));
}

/**
 * A move in money and percent together: "+$17,294.21 (+0.39%)" up, "($49,570.01) (1.06%)" down. A percentage already
 * in parentheses isn't wrapped again. `money` is already formatted (dollars or a plain amount).
 */
export function fmtChangePair(money: string, pct: Num, digits = 2) {
  const p = fmtChangePct(pct, digits);
  return p.startsWith("(") ? `${money} ${p}` : `${money} (${p})`;
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

/* ------------------------------------------------------------------------------------------------------ dates */

type When = string | Date | null | undefined;

/** A "YYYY-MM-DD" is that calendar date; anything else is an instant, read in New York. */
function toNY(d: When): DateTime | null {
  if (!d) return null;
  const dt =
    typeof d === "string"
      ? /^\d{4}-\d{2}-\d{2}$/.test(d)
        ? DateTime.fromISO(d, { zone: NY })
        : DateTime.fromISO(d).setZone(NY)
      : DateTime.fromJSDate(d).setZone(NY);
  return dt.isValid ? dt : null;
}

const sameYear = (dt: DateTime, now: Date) => dt.year === DateTime.fromJSDate(now).setZone(NY).year;

/** "Sep 28, 2026": a full date, or any date where the year matters. */
export function fmtDate(d: When) {
  return toNY(d)?.toFormat("LLL d, yyyy") ?? "";
}

/**
 * Text saved with ISO days in it (a filing's "10-Q filed 2026-07-31", an older evidence title) read the app's way:
 * "10-Q filed Jul 31, 2026". Timestamps (a date followed by T) are left alone.
 */
export function humanDates(text: string): string {
  return text.replace(/\b(\d{4}-\d{2}-\d{2})\b(?!T)/g, (d) => fmtDate(d) || d);
}

/**
 * A saved document or evidence title as the app shows it: ISO days in its words ("filed Jul 31, 2026") and no
 * exhibit type repeated in brackets ("EX-99.1 (EX-99.1)" or "(EXHIBIT 99.1)" reads "EX-99.1").
 */
export function readableTitle(title: string): string {
  return humanDates(title.replace(/\b(EX-(\d+(?:\.\d+)?)) \((?:EX-|EXHIBIT\s*)\2\)/gi, "$1"));
}

/** "Mon, Sep 28" for a day this year; "Sep 22, 2025" for one in another year. */
export function fmtDay(d: When, now: Date = new Date()) {
  const dt = toNY(d);
  if (!dt) return "";
  return sameYear(dt, now) ? dt.toFormat("ccc, LLL d") : dt.toFormat("LLL d, yyyy");
}

/** "Sep 28": chart axes and tight columns, where the weekday and year are clear from context. */
export function fmtDayMonth(d: When) {
  return toNY(d)?.toFormat("LLL d") ?? "";
}

/** "September 2026": a month, as a calendar heading. */
export function fmtMonth(d: When) {
  return toNY(d)?.toFormat("LLLL yyyy") ?? "";
}

/** "2:41 PM ET": 12-hour New York time, no seconds. */
export function fmtTime(d: When) {
  const dt = toNY(d);
  return dt ? `${dt.toFormat("h:mm a")} ET` : "";
}

/** "Mon, Sep 28, 12:00 PM ET"; "Sep 22, 2025, 10:00 AM ET" in another year. */
export function fmtDateTime(d: When, now: Date = new Date()) {
  const dt = toNY(d);
  return dt ? `${fmtDay(dt.toJSDate(), now)}, ${fmtTime(dt.toJSDate())}` : "";
}

/** "just now", "5m ago", "3h ago", "2d ago"; the full date after a month. */
export function relativeTime(d: When, now: number = Date.now()) {
  if (!d) return "";
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const m = Math.round((now - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(new Date(t));
}

/** Sentences and fragments joined with ". ", never doubling a period a part already ends with ("…the team. 4 days overdue"). */
export function joinSentences(parts: (string | null | undefined | false)[]): string {
  return parts
    .filter((p): p is string => Boolean(p && p.trim()))
    .map((p, i, all) => (i < all.length - 1 ? p.trim().replace(/[.\s]+$/, "") : p.trim()))
    .join(". ");
}
