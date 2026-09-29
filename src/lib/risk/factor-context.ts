import "server-only";
import type { CurrentUser } from "@/lib/auth";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { bookExposure, factorLineAudience, type CalendarFactorContext } from "@/lib/economic-calendar/factor-lines";
import { isFactorReport } from "./factors";
import { loadRisk } from "./load";
import { DEFAULT_LOOKBACK, LOOKBACKS } from "./model";

export type { CalendarFactorContext };

/**
 * Execs and admins get the Fund's betas, a team's lead their team's, and everyone else only which factors a
 * release moves (the Exposure pages themselves are limited the same way). Reads the Risk page's cached report
 * over its default window. Never throws: without numbers the lines still show the sensitivity.
 */
export async function calendarFactorContext(user: Pick<CurrentUser, "role" | "teamId" | "team">): Promise<CalendarFactorContext> {
  const audience = factorLineAudience(user);
  if (audience.kind === "label") return { audience: "label", exposure: null, href: null, basis: null };
  const team = audience.kind === "team" ? user.team : null;
  const href = audience.kind === "fund" ? `/t/${FUND_SCOPE_SLUG}/exposure#factors` : team ? `/t/${team.slug}/exposure#factors` : null;
  try {
    const loaded = await loadRisk(DEFAULT_LOOKBACK, audience.kind === "team" ? audience.teamId : null);
    const f = loaded.state === "ok" ? loaded.report.factors : null;
    if (!isFactorReport(f)) return { audience: audience.kind, exposure: null, href, basis: null };
    return {
      audience: audience.kind,
      exposure: bookExposure(team ? `the ${team.name} book` : "the book", f.fund),
      href,
      basis: `${LOOKBACKS[DEFAULT_LOOKBACK].label} of daily returns to ${f.sample.to}`,
    };
  } catch (e) {
    console.error("[calendar] factor context failed", e);
    return { audience: audience.kind, exposure: null, href, basis: null };
  }
}
