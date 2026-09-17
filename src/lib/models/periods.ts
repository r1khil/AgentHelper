/** Best-effort parse of a column header like "Q3 2025", "FY25", "3Q24", "Sep-25", "2025-09-30" into a period-end ISO date. Calendar-year quarters are assumed; the student can override. */
export function parsePeriodLabel(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return endOfMonth(y, Number(m[1]));
  }
  const year = (t: string) => (t.length === 2 ? 2000 + Number(t) : Number(t));
  m = s.match(/(?:^|\b)Q([1-4])\s*'?(?:FY)?\s*(\d{2}|\d{4})\b/i) ?? s.match(/\b(?:FY)?\s*(\d{4})\s*Q([1-4])\b/i)?.slice(0).reverse().map((x, i, a) => (i === 0 ? a[2] : i === 2 ? a[0] : x)) as RegExpMatchArray | null;
  if (m && m[1] && m[2]) return quarterEnd(year(m[2]), Number(m[1]));
  m = s.match(/\b([1-4])Q\s*'?(\d{2}|\d{4})\b/i);
  if (m) return quarterEnd(year(m[2]), Number(m[1]));
  m = s.match(/\bFY\s*'?(\d{2}|\d{4})\b/i) ?? s.match(/^(\d{4})[AE]?$/);
  if (m) return `${year(m[1])}-12-31`;
  m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-'.,]*(\d{2}|\d{4})\b/i);
  if (m) {
    const mo = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    return endOfMonth(year(m[2]), mo);
  }
  return null;
}

function quarterEnd(y: number, q: number) {
  return endOfMonth(y, q * 3);
}

function endOfMonth(y: number, mo: number) {
  const d = new Date(Date.UTC(y, mo, 0));
  return d.toISOString().slice(0, 10);
}
