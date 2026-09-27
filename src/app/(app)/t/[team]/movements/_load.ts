import "server-only";
import { notFound } from "next/navigation";
import { loadScope } from "@/lib/teams";
import { getMovement, listEvidence, listTeamMovements } from "@/lib/movements";
import { listTeamMembers } from "@/lib/holdings";
import { canManageTeam } from "@/lib/auth";
import { agentConfigured } from "@/lib/agent/model";
import { isOverdue } from "@/components/app/movements/format";
import type { MovementDetailData, MovementListItem } from "@/components/app/movements/types";

const num = (v: string | null) => (v === null || v === "" ? null : Number(v));

/**
 * The movements master–detail for a scope. `selectedId` comes from /movements/[id]; without it the first
 * unfinished movement is selected (overdue ones sort first among those), or nothing.
 */
export async function loadMovementsView(slug: string, selectedId: string | null) {
  const scope = await loadScope(slug);
  const rows = await listTeamMovements(scope.teamIds);
  const now = Date.now();
  const items: MovementListItem[] = rows.map(({ m, h, ownerName }) => ({
    id: m.id,
    href: `/t/${scope.slug}/movements/${m.id}`,
    ticker: h.ticker,
    relativePp: num(m.relativeMovePp),
    dataQuality: m.dataQuality,
    status: m.status,
    overdue: isOverdue(m.status, m.dueAt, now),
    sessionDate: m.sessionDate,
    ownerName,
    teamName: scope.teamById.get(h.teamId)?.name ?? null,
  }));

  let id = selectedId;
  if (!id) {
    const unfinished = items.filter((i) => i.status !== "completed");
    id = (unfinished.find((i) => i.overdue) ?? unfinished[0])?.id ?? null;
  }
  if (!id) return { scope, items, selected: null };

  const row = await getMovement(id);
  if (!row || !scope.teamById.has(row.h.teamId)) notFound();
  const { m, h, ownerName } = row;
  const team = scope.teamById.get(h.teamId)!;
  const [evidence, members] = await Promise.all([listEvidence(m.id), listTeamMembers(h.teamId)]);
  const manage = canManageTeam(scope.user, h.teamId);

  const selected: MovementDetailData = {
    id: m.id,
    ticker: h.ticker,
    companyName: h.companyName,
    holdingHref: `/t/${team.slug}/h/${h.ticker}`,
    askHootHref: `/t/${team.slug}/agent/h/${h.ticker}`,
    sessionDate: m.sessionDate,
    holdingReturnPct: num(m.holdingReturnPct),
    spxReturnPct: num(m.spxReturnPct),
    relativePp: num(m.relativeMovePp),
    dataQuality: m.dataQuality,
    status: m.status,
    overdue: isOverdue(m.status, m.dueAt, now),
    dueAt: m.dueAt,
    completedAt: m.completedAt,
    ownerId: m.ownerId,
    ownerName,
    leadNames: members.filter((p) => p.role === "lead_analyst").map((p) => p.fullName),
    updateText: m.updateText,
    feedback: m.feedback,
    evidenceStatus: m.evidenceStatus,
    evidence: evidence.map((e) => ({
      id: e.id,
      kind: e.kind,
      title: e.title,
      url: e.url,
      publisher: e.publisher,
      publishedAt: e.publishedAt,
      retrievedAt: e.retrievedAt,
      failed: Boolean((e.payload as { error?: boolean })?.error),
    })),
    members: members.map((p) => ({ id: p.id, fullName: p.fullName })),
    ownerLocked: !manage && m.ownerId !== null && m.ownerId !== scope.user.id,
    agentConfigured: agentConfigured(),
  };
  return { scope, items, selected };
}
