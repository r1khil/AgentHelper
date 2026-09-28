import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { pickTeamRecipients, type Recipient } from "./recipients-rule";

/** Who a team's movement alerts, reminders, overdue notices and prep-pack emails go to (see pickTeamRecipients). */
export async function teamRecipients(teamId: string): Promise<Recipient[]> {
  const people = await db.select({ id: profiles.id, email: profiles.email, role: profiles.role }).from(profiles).where(eq(profiles.teamId, teamId));
  return pickTeamRecipients(people);
}
