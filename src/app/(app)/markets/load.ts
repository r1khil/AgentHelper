import "server-only";
import { DateTime } from "luxon";
import type { Team } from "@/db/schema";
import { isFundWide, listAccessibleTeams, type CurrentUser } from "@/lib/auth";
import { loadTeamSectors } from "@/lib/attribution/load";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { listBellwethers, listCalendarHoldingEvents, listTeamEarnings } from "@/lib/earnings";
import { LIST_DAYS, expectationsState, filterCalendarEvents, toCalendarEvents, type CalendarEvent } from "@/lib/earnings-calendar";
import { NY, todayNY } from "@/lib/providers/calendar";
import type { MarketsData, MarketsNotice, MarketsQuery, ReportRow } from "./types";

/**
 * Markets' earnings, in the reader's scope: every fund holding for execs and admins, the member's own team otherwise.
 * With sector bellwethers on, a team also sees the rest of its sectors (other teams' holdings and the bellwethers), as
 * the old calendar's Sector view did. The economic releases stream in on the client from /api/economic-calendar.
 */
export async function loadMarkets(user: CurrentUser, q: MarketsQuery): Promise<MarketsData> {
  const fundWide = isFundWide(user);
  const today = todayNY();
  const through = DateTime.fromISO(today, { zone: NY })
    .plus({ days: LIST_DAYS - 1 })
    .toISODate()!;
  const teams: Team[] = await listAccessibleTeams(user);
  // Execs and admins see the whole fund unless ?team= names one; everyone else sees their own team.
  const own: Team | null = fundWide ? (teams.find((t) => t.slug === q.team) ?? null) : (user.team ?? null);
  const teamIds = own ? [own.id] : teams.map((t) => t.id);

  const [holdingEvents, bellwethers, rows, sectorMap] = await Promise.all([
    listCalendarHoldingEvents(today, through),
    listBellwethers(),
    teamIds.length ? listTeamEarnings(teamIds) : Promise.resolve([]),
    own ? loadTeamSectors() : Promise.resolve(new Map()),
  ]);
  const sectors = own ? (sectorMap.get(own.id) ?? []) : [];
  const all = toCalendarEvents(holdingEvents, bellwethers).filter((ev) => ev.date >= today && ev.date <= through);
  const teamSet = new Set(teamIds);

  let events: CalendarEvent[];
  if (q.bellwethers) {
    // The fund: everything, a bellwether the fund holds shown once as the holding. A team: its sector view.
    events = own ? filterCalendarEvents(all, { view: "sector", teamId: own.id, teamSectors: sectors }) : filterCalendarEvents(all, { view: "fund", teamId: "", teamSectors: [] });
    if (!own && !fundWide) events = events.filter((ev) => ev.kind === "bellwether");
  } else {
    events = all.filter((ev) => ev.kind === "holding" && !!ev.teamId && teamSet.has(ev.teamId));
  }

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const reports: ReportRow[] = rows.map(({ e, h }) => {
    const t = teamById.get(h.teamId);
    return {
      id: e.id,
      ticker: h.ticker,
      name: h.companyName ?? h.ticker,
      teamSlug: t?.slug ?? null,
      teamName: t?.name ?? null,
      reportDate: e.reportDate,
      reportHour: e.reportHour,
      dateStatus: e.dateStatus,
      epsEstimate: e.epsEstimate,
      epsCurrency: e.epsCurrency,
      expectations: expectationsState(e),
      status: e.status,
    };
  });

  const notices: MarketsNotice[] = [];
  if (!fundWide && !own) notices.push({ text: "You aren't on a team yet, so no fund reports are listed. The economic releases are below." });
  else if (rows.length === 0) notices.push({ text: "No earnings dates yet. Dates are pulled each morning for every holding; an admin can run the morning sweep now from the Admin page." });
  if (q.bellwethers && bellwethers.length === 0)
    notices.push({ text: "Sector bellwethers appear after the next morning sweep.", link: fundWide ? { href: "/admin", label: "Run it now from the Admin page." } : undefined });
  if (q.bellwethers && own && sectors.length === 0) {
    notices.push({
      text: `No GICS sectors are assigned to ${fundWide ? own.name : "your team"}, so only its own holdings are shown.`,
      link: fundWide ? { href: "/attribution/ledger?tab=securities", label: "Assign sectors on the ledger." } : undefined,
    });
  }

  return {
    scopeSlug: own ? own.slug : fundWide ? FUND_SCOPE_SLUG : null,
    teamSlug: own?.slug ?? null,
    today,
    events,
    accessibleTeamIds: teams.map((t) => t.id),
    reports,
    showTeam: !own && teams.length > 1,
    notices,
    team: own ? { slug: own.slug, name: own.name } : null,
    teams: fundWide ? teams.map((t) => ({ slug: t.slug, name: t.name })) : [],
  };
}
