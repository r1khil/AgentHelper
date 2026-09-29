// Client-safe: Markets' URL state and the rows the server hands the page.
import { DateTime } from "luxon";
import type { CalendarEvent, ExpectationsState } from "@/lib/earnings-calendar";
import { NY } from "@/lib/providers/calendar";

/** A fund report on record, for Just in, Past and the reports after the five weeks. */
export type ReportRow = {
  id: string;
  ticker: string;
  name: string;
  teamSlug: string | null;
  teamName: string | null;
  reportDate: string;
  reportHour: string | null;
  dateStatus: "confirmed" | "estimated" | null;
  epsEstimate: string | null;
  epsCurrency: string | null;
  expectations: ExpectationsState;
  status: "upcoming" | "reported" | "reviewed";
};

/** A note about the data (no dates yet, no bellwethers yet, no sectors), with the way to fix it when there is one. */
export type MarketsNotice = { text: string; link?: { href: string; label: string } };

type SearchParams = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What the URL asks for: `?team=` narrows an exec's or admin's whole-fund view to one team (members always see their
 * own); `?show=bellwethers` adds the sector bellwethers to the fund's reports; `?view=past` shows the five weeks up to
 * `?to=` (yesterday by default) instead of the coming five.
 */
export type MarketsQuery = { team: string | null; bellwethers: boolean; view: "upcoming" | "past"; to: string | null };

export function isDay(v: string | null | undefined): v is string {
  return !!v && DAY_RE.test(v) && DateTime.fromISO(v, { zone: NY }).isValid;
}

export function parseMarketsQuery(sp: SearchParams): MarketsQuery {
  const to = one(sp.to);
  const team = one(sp.team)?.trim().slice(0, 80);
  return { team: team || null, bellwethers: one(sp.show) === "bellwethers", view: one(sp.view) === "past" ? "past" : "upcoming", to: isDay(to) ? to : null };
}

/** `/markets` (or a preview's route) with its query; only what differs from the default is written. */
export function marketsHref(q: Partial<MarketsQuery>, base = "/markets"): string {
  const p = new URLSearchParams();
  if (q.team) p.set("team", q.team);
  if (q.bellwethers) p.set("show", "bellwethers");
  if (q.view === "past") p.set("view", "past");
  if (q.view === "past" && q.to) p.set("to", q.to);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/** What the server loads for Markets (see load.ts). */
export type MarketsData = {
  /** The scope links open in: the fund for execs and admins, the member's team otherwise (null without one). */
  scopeSlug: string | null;
  /** The team a Hoot chat about a release opens under; null for the fund. */
  teamSlug: string | null;
  today: string;
  /** The fund's reports (and, with the toggle, bellwethers) from today through the five weeks. */
  events: CalendarEvent[];
  accessibleTeamIds: string[];
  /** Every report on record in the scope, newest first: Just in, Past, and those after the five weeks. */
  reports: ReportRow[];
  /** Name each report's team (the fund's view of several teams). */
  showTeam: boolean;
  /** The one team in view, or null for the whole fund. */
  team: { slug: string; name: string } | null;
  /** The teams an exec or admin can narrow to; empty for everyone else. */
  teams: { slug: string; name: string }[];
  notices: MarketsNotice[];
};
