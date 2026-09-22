import { eq, inArray, type Column } from "drizzle-orm";

/** One team, or several for the fund-wide scope. */
export type TeamIds = string | string[];

export function inTeams(column: Column, teamIds: TeamIds) {
  return Array.isArray(teamIds) ? inArray(column, teamIds) : eq(column, teamIds);
}
