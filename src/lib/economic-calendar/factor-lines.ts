import { DateTime } from "luxon";
import type { Profile } from "@/db/schema";
import { NY } from "@/lib/providers/calendar";
import { factorMeaning, formatBeta, T_STAT_THRESHOLD, type FactorFit, type FactorKey } from "@/lib/risk/factors";
import { isFundWide } from "@/lib/roles";
import { TRADINGVIEW_CATEGORIES } from "./tradingview-provider";
import type { EconomicEvent } from "./types";

/**
 * Which factor each market-moving release tends to move, and a one-line reminder of the book's
 * exposure to it on the calendar. Descriptive only: the line states a sensitivity, never a trade.
 */

export type ReleaseRule = {
  key: string;
  /** Short name the line leads with. */
  label: string;
  factors: FactorKey[];
  /** Any of these on the event name. */
  names: RegExp[];
  exclude?: RegExp[];
  /** TradingView categories the release is filed under. A TradingView event in another category doesn't match; other providers match on name alone. */
  categories?: string[];
  /** Lowest importance that gets a line (3 = high). Events without an importance are included. */
  minImportance: 1 | 2 | 3;
};

const RATES_DOLLAR: FactorKey[] = ["rates", "dollar"];

export const RELEASE_FACTORS: readonly ReleaseRule[] = [
  { key: "cpi", label: "CPI", factors: RATES_DOLLAR, names: [/\bCPI\b/i, /\binflation rate\b/i, /\bconsumer price index\b/i], exclude: [/expectation/i], categories: ["Prices"], minImportance: 3 },
  { key: "pce", label: "PCE", factors: RATES_DOLLAR, names: [/\bPCE\b/i, /\bpersonal consumption expenditures? price/i], categories: ["Prices"], minImportance: 3 },
  { key: "ppi", label: "PPI", factors: RATES_DOLLAR, names: [/\bPPI\b/i, /\bproducer price/i], categories: ["Prices"], minImportance: 3 },
  { key: "jobs", label: "Jobs report", factors: RATES_DOLLAR, names: [/\bnon ?-?farm payrolls\b/i, /\bNFP\b/, /\bunemployment rate\b/i, /\baverage hourly earnings\b/i, /\bemployment situation\b/i], categories: ["Labor"], minImportance: 3 },
  { key: "fomc", label: "FOMC", factors: RATES_DOLLAR, names: [/\bFOMC\b/i, /\binterest rate decision\b/i, /\bfed press conference\b/i, /\bfed(?:eral)? funds rate\b/i], exclude: [/projection/i, /speech/i], categories: ["Money"], minImportance: 3 },
  { key: "gdp", label: "GDP", factors: RATES_DOLLAR, names: [/\bGDP\b/i], categories: ["GDP", "Prices"], minImportance: 3 },
  { key: "eia-crude", label: "EIA crude", factors: ["oil"], names: [/\bEIA\b.*\bcrude\b/i, /\bcrude (?:oil )?(?:stocks|inventor)/i], exclude: [/\bAPI\b/], categories: ["Energy"], minImportance: 2 },
  { key: "opec", label: "OPEC", factors: ["oil"], names: [/\bOPEC\b/i], minImportance: 2 },
];

/** The release rule an event falls under, or null. Matches on the name, checked against TradingView's category when it has one. */
export function releaseRule(e: Pick<EconomicEvent, "name" | "category">): ReleaseRule | null {
  const tvCategory = e.category && TRADINGVIEW_CATEGORIES.has(e.category) ? e.category : null;
  for (const rule of RELEASE_FACTORS) {
    if (!rule.names.some((r) => r.test(e.name))) continue;
    if (rule.exclude?.some((r) => r.test(e.name))) continue;
    if (tvCategory && rule.categories && !rule.categories.includes(tvCategory)) continue;
    return rule;
  }
  return null;
}

const NOUN: Record<FactorKey, string> = { market: "market", size: "size", value: "value", momentum: "momentum", rates: "rates", dollar: "dollar", oil: "oil" };

/** "rates-sensitive", "rates- and dollar-sensitive". */
export function sensitivityLabel(factors: FactorKey[]) {
  const nouns = factors.map((f) => NOUN[f]);
  if (nouns.length <= 1) return `${nouns[0] ?? "market"}-sensitive`;
  return `${nouns.slice(0, -1).map((n) => `${n}-`).join(", ")} and ${nouns.at(-1)}-sensitive`;
}

export type FactorLineAudience = { kind: "fund" } | { kind: "team"; teamId: string } | { kind: "label" };

/** Execs and admins see the Fund's exposure; a team's lead sees their team's; everyone else sees only which factors a release moves. */
export function factorLineAudience(user: Pick<Profile, "role" | "teamId">): FactorLineAudience {
  if (isFundWide(user)) return { kind: "fund" };
  if (user.role === "lead_analyst" && user.teamId) return { kind: "team", teamId: user.teamId };
  return { kind: "label" };
}

/** The exposure a line quotes: whose book, and its betas with t-stats. */
export type BookExposure = { subject: string; betas: Partial<Record<FactorKey, { beta: number; t: number }>> };

/** A regression row (the Fund's, or a team's) as the exposure a line quotes. */
export function bookExposure(subject: string, fit: Pick<FactorFit, "betas">): BookExposure {
  return { subject, betas: Object.fromEntries(Object.entries(fit.betas).map(([k, c]) => [k, { beta: c.beta, t: c.t }])) };
}

/** "Thu 8:30" for a morning release, "Wed 2:00 PM" for an afternoon one, "Thu" when the feed has no time. */
export function releaseWhen(e: Pick<EconomicEvent, "timestamp" | "date" | "time" | "tentative">) {
  if (e.timestamp) {
    const at = DateTime.fromISO(e.timestamp, { zone: "utc" }).setZone(NY);
    return at.toFormat(at.hour < 12 ? "ccc h:mm" : "ccc h:mm a");
  }
  const day = DateTime.fromISO(e.date, { zone: NY }).toFormat("ccc");
  return e.tentative || !e.time || /all day/i.test(e.time) ? day : `${day} ${e.time}`;
}

function exposureClause(factors: FactorKey[], exposure: BookExposure) {
  const clear: string[] = [];
  const unclear: string[] = [];
  for (const f of factors) {
    const b = exposure.betas[f];
    if (!b || !Number.isFinite(b.beta)) continue;
    const meaning = factorMeaning(f, b.beta);
    if (meaning && Math.abs(b.t) >= T_STAT_THRESHOLD) clear.push(`${meaning} (β ${formatBeta(b.beta)})`);
    else unclear.push(NOUN[f]);
  }
  const weak = unclear.length ? `no clear ${unclear.join(" or ")} exposure (|t| < ${T_STAT_THRESHOLD})` : null;
  if (clear.length) return `${exposure.subject} is ${clear.join(" and ")}${weak ? `; ${weak}` : ""}`;
  return weak ? `${exposure.subject} shows ${weak}` : null;
}

export type FactorLine = { ruleKey: string; eventId: string; date: string; label: string; factors: FactorKey[]; text: string };

/** "CPI Thu 8:30 · rates- and dollar-sensitive · the book is net short duration (β −0.12)". Without an exposure, the first two parts only. */
export function factorLine(e: EconomicEvent, rule: ReleaseRule, exposure: BookExposure | null): FactorLine {
  const parts = [`${rule.label} ${releaseWhen(e)}`, sensitivityLabel(rule.factors)];
  const clause = exposure ? exposureClause(rule.factors, exposure) : null;
  if (clause) parts.push(clause);
  return { ruleKey: rule.key, eventId: e.id, date: e.date, label: rule.label, factors: rule.factors, text: parts.join(" · ") };
}

const eligible = (e: EconomicEvent, rule: ReleaseRule) => e.importance === null || e.importance >= rule.minImportance;

/** One line per release per day (CPI's MoM, YoY and core prints share one), for the important releases the table covers, in time order. */
export function factorLines(events: EconomicEvent[], exposure: BookExposure | null): FactorLine[] {
  const first = new Map<string, { e: EconomicEvent; rule: ReleaseRule }>();
  const at = (e: EconomicEvent) => (e.timestamp ? Date.parse(e.timestamp) : Date.parse(`${e.date}T23:59:59Z`));
  for (const e of events) {
    const rule = releaseRule(e);
    if (!rule || !eligible(e, rule)) continue;
    const key = `${rule.key}|${e.date}`;
    const seen = first.get(key);
    if (!seen || at(e) < at(seen.e)) first.set(key, { e, rule });
  }
  return [...first.values()].sort((a, b) => at(a.e) - at(b.e)).map(({ e, rule }) => factorLine(e, rule, exposure));
}
