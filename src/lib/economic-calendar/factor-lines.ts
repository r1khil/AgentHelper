import { DateTime } from "luxon";
import type { Profile } from "@/db/schema";
import { NY } from "@/lib/providers/calendar";
import { factorMeaning, factorNoun, formatBeta, isClearExposure, T_STAT_THRESHOLD, type FactorFit, type FactorKey } from "@/lib/risk/factors";
import { isFundWide } from "@/lib/roles";
import { TRADINGVIEW_CATEGORIES } from "./tradingview-categories";
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

/** What the economic calendar may say about the viewer's book next to each release. Serializable, for the client calendar. */
export type CalendarFactorContext = {
  audience: FactorLineAudience["kind"];
  /** The betas the lines quote; null for everyone else, or when they can't be estimated yet. */
  exposure: BookExposure | null;
  /** The Exposure page's factor section for this audience, or null when the viewer can't open it. */
  href: string | null;
  /** "1 year of daily returns to 2026-09-24", for the caption. */
  basis: string | null;
};

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

/**
 * What the book's betas say about the release's factors. Only significant, non-zero betas are described
 * as a position; the rest read "no clear … exposure" with the beta, so the line never implies a bet the
 * data can't distinguish from zero.
 */
function exposureClause(factors: FactorKey[], exposure: BookExposure) {
  const clear: string[] = [];
  const weak: { noun: string; beta: string }[] = [];
  const negligible: { noun: string; beta: string }[] = [];
  for (const f of factors) {
    const b = exposure.betas[f];
    if (!b || !Number.isFinite(b.beta)) continue;
    const beta = formatBeta(b.beta, 2);
    if (isClearExposure(f, b)) clear.push(`${factorMeaning(f, b.beta)} (β ${beta})`);
    else if (Number.isFinite(b.t) && Math.abs(b.t) >= T_STAT_THRESHOLD) negligible.push({ noun: factorNoun(f), beta });
    else weak.push({ noun: factorNoun(f), beta });
  }
  const group = (list: { noun: string; beta: string }[], why: string) =>
    list.length ? `no clear ${list.map((x) => x.noun).join(" or ")} exposure (β ${list.map((x) => x.beta).join(" and ")}, ${why})` : null;
  const unclear = [group(weak, "not significant"), group(negligible, "negligible")].filter(Boolean).join("; ");
  if (clear.length) return `${exposure.subject} is ${clear.join(" and ")}${unclear ? `; ${unclear}` : ""}`;
  return unclear ? `${exposure.subject} has ${unclear}` : null;
}

export type FactorLine = {
  ruleKey: string;
  eventId: string;
  date: string;
  label: string;
  factors: FactorKey[];
  /** "CPI Thu 8:30 · rates- and dollar-sensitive" */
  head: string;
  /** "the book is net short duration (β (0.12))", or null without an exposure. */
  clause: string | null;
  text: string;
};

/** "CPI Thu 8:30 · rates- and dollar-sensitive · the book is net short duration (β −0.12)". Without an exposure, the first two parts only. */
export function factorLine(e: EconomicEvent, rule: ReleaseRule, exposure: BookExposure | null): FactorLine {
  const head = `${rule.label} ${releaseWhen(e)} · ${sensitivityLabel(rule.factors)}`;
  const clause = exposure ? exposureClause(rule.factors, exposure) : null;
  return { ruleKey: rule.key, eventId: e.id, date: e.date, label: rule.label, factors: rule.factors, head, clause, text: clause ? `${head} · ${clause}` : head };
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
