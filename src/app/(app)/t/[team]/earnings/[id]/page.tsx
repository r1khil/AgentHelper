import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { itemTeam, loadScope } from "@/lib/teams";
import { getEarnings, listEarningsEvidence, prepPackRecipients } from "@/lib/earnings";
import { canManageTeam } from "@/lib/auth";
import { agentConfigured } from "@/lib/agent/model";
import { todayNY } from "@/lib/providers/calendar";
import { ReportView } from "@/components/app/earnings/report-view";

export const metadata: Metadata = { title: "Earnings" };

export default async function EarningsDetail({ params, searchParams }: { params: Promise<{ team: string; id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ team: slug, id }, { error }] = await Promise.all([params, searchParams]);
  // The fund scope shows any team's report; a team scope only its own.
  const scope = await loadScope(slug);
  const { user } = scope;
  const row = await getEarnings(id);
  if (!row) notFound();
  const team = itemTeam(scope, row.h.teamId);
  const { e, h } = row;
  const today = todayNY();
  const evidence = await listEarningsEvidence(e.id);
  const canBuild = canManageTeam(user, team.id) && e.reportDate > today && agentConfigured();
  const recipients = canBuild ? await prepPackRecipients(team.id) : [];
  return <ReportView e={e} h={h} team={team} scopeSlug={scope.slug} evidence={evidence} recipients={recipients} canBuild={canBuild} agentOn={agentConfigured()} error={error} today={today} />;
}
