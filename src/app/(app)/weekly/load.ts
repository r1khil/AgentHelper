import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { holdings, profiles, teams, type WeeklyUpdate } from "@/db/schema";
import { loadAttributionSeries } from "@/lib/attribution/load";
import { indexReturn } from "@/lib/attribution/view";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { listBellwethers } from "@/lib/earnings";
import { composeWeeklyEmail, weeklyEmailRecipients } from "@/lib/weekly/email";
import { packStatus } from "@/lib/weekly/status";
import { getPack, listPacks, normalizeAgenda, packFigures } from "@/lib/weekly/store";
import { agendaWeek, priceWindow } from "@/lib/weekly/weeks";
import type { EmailView, PackListItem, WeeklyPackProps, WeekStats } from "@/components/app/weekly/types";

/** The packs list on the left: newest first, with what happened to each. */
export async function loadPackList(): Promise<PackListItem[]> {
  const [packs, recipients] = await Promise.all([listPacks(), weeklyEmailRecipients()]);
  return packs.map((p) => listItem(p, !recipients.to));
}

function listItem(p: WeeklyUpdate, paused: boolean): PackListItem {
  const email = p.sources?.email;
  return {
    weekEnding: p.weekEnding,
    status: p.status,
    state: packStatus({ weekEnding: p.weekEnding, status: p.status, email }, { paused }),
    builtAt: p.builtAt?.toISOString() ?? null,
    sentAt: p.sentAt?.toISOString() ?? null,
    emailedAt: email?.status === "ok" ? email.at : null,
    listPaused: paused,
  };
}

/** First and full names for the addresses the pack goes to, so the page can say "to Aadi, Saad in CC". */
async function recipientNames(emails: string[]): Promise<{ names: Record<string, string>; fullNames: Record<string, string> }> {
  if (!emails.length) return { names: {}, fullNames: {} };
  const rows = await db.select({ email: profiles.email, fullName: profiles.fullName }).from(profiles).where(inArray(profiles.email, emails));
  return {
    names: Object.fromEntries(rows.map((r) => [r.email.toLowerCase(), r.fullName.trim().split(/\s+/)[0] || r.email])),
    fullNames: Object.fromEntries(rows.map((r) => [r.email.toLowerCase(), r.fullName.trim() || r.email])),
  };
}

/**
 * The week's headline figures: the Fund's and the S&P 500's price return over the same Monday-close-to-Friday-close
 * window the performers use. Null where the data isn't there.
 */
async function weekStats(weekEnding: string): Promise<WeekStats> {
  const window = priceWindow(weekEnding);
  const series = await loadAttributionSeries().catch(() => null);
  let fund: number | null = null;
  let spx: number | null = null;
  if (series) {
    const days = series.series.portfolio.filter((d) => d.date > window.start && d.date <= window.end);
    if (days.length && days.at(-1)!.date === window.end) fund = days.reduce((g, d) => g * (1 + d.ret), 1) - 1;
    spx = indexReturn(series, window);
  }
  return { fund, spx, window };
}

/** Everything the pack view needs, or null when the week has no pack. */
export async function loadPackView(week: string, meEmail: string): Promise<WeeklyPackProps | null> {
  const pack = await getPack(week);
  if (!pack) return null;
  const recipients = await weeklyEmailRecipients();
  const [draft, names, stats, teamRows, bellwethers] = await Promise.all([
    composeWeeklyEmail(week, recipients.to),
    recipientNames([recipients.to, ...recipients.cc].filter((e): e is string => Boolean(e))),
    weekStats(week),
    db.select({ ticker: holdings.ticker, team: teams.name, status: holdings.status }).from(holdings).innerJoin(teams, eq(teams.id, holdings.teamId)),
    listBellwethers().catch(() => []),
  ]);
  const email: EmailView | null = draft ? { ...recipients, ...draft, record: pack.sources?.email ?? null, ...names, me: meEmail } : null;
  // An active holding's team wins over an exited one's.
  const teamByTicker: Record<string, string> = {};
  for (const r of [...teamRows].sort((a, b) => (a.status === "active" ? 1 : 0) - (b.status === "active" ? 1 : 0))) teamByTicker[r.ticker.toUpperCase()] = r.team;
  const bellwetherByTicker: Record<string, string> = {};
  for (const b of bellwethers) bellwetherByTicker[b.ticker.toUpperCase()] = `${SECTOR_LABELS[b.sector] ?? b.sector} bellwether`;

  return {
    weekEnding: week,
    agendaRange: agendaWeek(week),
    status: pack.status,
    state: packStatus({ weekEnding: week, status: pack.status, email: pack.sources?.email }, { paused: !recipients.to }),
    figures: packFigures(pack),
    performers: pack.performers,
    agenda: normalizeAgenda(pack.agenda),
    lastWeekAgenda: normalizeAgenda(pack.lastWeekAgenda),
    sources: pack.sources ?? {},
    email,
    builtAt: pack.builtAt?.toISOString() ?? null,
    editedAt: pack.editedAt?.toISOString() ?? null,
    sentAt: pack.sentAt?.toISOString() ?? null,
    stats,
    teamByTicker,
    bellwetherByTicker,
  };
}
