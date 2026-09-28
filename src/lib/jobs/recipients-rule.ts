/** Pure part of who a team's email goes to, so the rule is testable without a database. */
import type { Role } from "@/db/schema";

export type TeamPerson = { id: string; email: string; role: Role };
export type Recipient = { id: string; email: string };

/**
 * A team's write-up and earnings email goes to its lead analysts, or to everyone on the team when it has no lead.
 * Leads come first so a launched team never mails the whole team: OpenMail caps cold sends at 20 a day.
 */
export function pickTeamRecipients(people: TeamPerson[]): Recipient[] {
  const leads = people.filter((p) => p.role === "lead_analyst");
  const out = new Map<string, Recipient>();
  for (const p of leads.length ? leads : people) out.set(p.id, { id: p.id, email: p.email });
  return [...out.values()];
}
