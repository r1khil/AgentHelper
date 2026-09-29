import type { Metadata } from "next";
import { asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { invitations, jobRuns, profiles, teams } from "@/db/schema";
import { requireRole, transparencyEnabled } from "@/lib/auth";
import { EMBEDDING_MODELS, RERANK_MODELS, embeddingDims, embeddingModelId, rerankModelId } from "@/lib/agent/retrieval-models";
import { embeddingConfigured } from "@/lib/agent/embeddings";
import { getSetting } from "@/lib/settings";
import { WEEKLY_EMAIL_DEFAULT, WEEKLY_RECIPIENTS_SETTING } from "@/lib/weekly/email";
import { changelogModelId } from "@/lib/changelog/summarize";
import { mcpBudgets } from "@/lib/agent/mcp-budget";
import { AGENT_MODELS, agentModelId } from "@/lib/agent/model";
import type { JobRunView } from "@/app/api/admin/job-runs/route";
import { AdminView } from "@/components/app/admin/admin-view";
import { loadAdminStatus } from "./status";

export const metadata: Metadata = { title: "Admin" };
// Jobs started from this page run inside its server actions; give them the same budget as the cron routes.
export const maxDuration = 300;

/**
 * When each member was last signed in or active: the later of Supabase Auth's last sign-in and their newest session's
 * last refresh. Null (the column shows "—") when the auth schema can't be read from here.
 */
async function lastActivity(): Promise<Map<string, string> | null> {
  try {
    const rows = await db.execute<{ id: string; at: number | string | null }>(sql`
      select u.id, extract(epoch from greatest(u.last_sign_in_at, (select max(s.updated_at) from auth.sessions s where s.user_id = u.id)))::float8 as at
      from auth.users u
    `);
    const out = new Map<string, string>();
    for (const r of rows) if (r.at !== null) out.set(r.id, new Date(Number(r.at) * 1000).toISOString());
    return out;
  } catch (e) {
    console.warn(`[admin] last activity unavailable: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; tab?: string }> }) {
  // Execs see everything an admin sees; only admins can change anything (the server actions enforce this too).
  const me = await requireRole("exec", "admin");
  const canMutate = me.role === "admin";
  const { ok, error, tab } = await searchParams;
  const transparency = transparencyEnabled(me);

  const [runRows, status, currentModelId, embedId, rerankId, weeklyRecipients, allTeams, members, pending, activity] = await Promise.all([
    db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(12),
    loadAdminStatus(),
    agentModelId(),
    embeddingModelId(),
    rerankModelId(),
    getSetting(WEEKLY_RECIPIENTS_SETTING),
    db.select().from(teams).orderBy(asc(teams.sortOrder)),
    db.select({ p: profiles, teamName: teams.name }).from(profiles).leftJoin(teams, eq(teams.id, profiles.teamId)).orderBy(asc(profiles.role), asc(profiles.fullName)),
    db.select().from(invitations).where(isNull(invitations.acceptedAt)).orderBy(desc(invitations.createdAt)),
    lastActivity(),
  ]);
  const { drive, mcp, last, driveUnmatched, services, filings, retrievalStats: retrieval, connections, attention } = status;
  const [mcpBudget, changelogModel] = await Promise.all([
    mcpBudgets(mcp.map((m) => m.name)).catch(() => ({}) as Awaited<ReturnType<typeof mcpBudgets>>),
    changelogModelId(),
  ]);

  const runs: JobRunView[] = runRows.map((r) => ({
    id: r.id,
    job: r.job,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    ok: r.ok,
    summary: r.summary,
    current: r.progress.at(-1) ?? null,
    progress: transparency ? r.progress : null,
  }));
  const currentModel = AGENT_MODELS.find((m) => m.id === currentModelId);
  const embedModel = EMBEDDING_MODELS.find((m) => m.id === embedId);
  const embedDims = (() => {
    try {
      return embeddingDims(embedId);
    } catch {
      return null;
    }
  })();
  const weeklyTo = weeklyRecipients?.trim() || `${WEEKLY_EMAIL_DEFAULT.join(", ")} (default)`;
  const activeTab = tab === "jobs" ? "jobs" : "members";
  // A roster sorted by role enum order puts associates first; the design leads with the fund-wide roles.
  const roleOrder = { admin: 0, exec: 1, lead_analyst: 2, associate_analyst: 3 } as const;
  const sortedMembers = [...members].sort((a, b) => roleOrder[a.p.role] - roleOrder[b.p.role] || a.p.fullName.localeCompare(b.p.fullName));

  return (
    <AdminView
      tab={activeTab}
      attention={attention}
      connections={connections}
      meEmail={me.email}
      canMutate={canMutate}
      transparency={transparency}
      notice={{ ok, error }}
      members={{
        canMutate,
        meId: me.id,
        now: new Date().toISOString(),
        activityKnown: activity !== null,
        teams: allTeams.map((t) => ({ id: t.id, name: t.name })),
        members: sortedMembers.map(({ p, teamName }) => ({
          id: p.id,
          fullName: p.fullName,
          email: p.email,
          username: p.username,
          kind: p.kind,
          role: p.role,
          teamId: p.teamId,
          teamName,
          onboarded: Boolean(p.onboardedAt),
          lastActive: activity?.get(p.id) ?? null,
        })),
        invitations: pending.map((i) => ({
          id: i.id,
          email: i.email,
          fullName: i.fullName,
          role: i.role,
          teamName: allTeams.find((t) => t.id === i.teamId)?.name ?? null,
          createdAt: i.createdAt.toISOString(),
        })),
      }}
      jobs={{ canMutate, last, weekly: { recipients: weeklyRecipients, to: weeklyTo }, meEmail: me.email }}
      runs={runs}
      services={services}
      drive={drive}
      driveUnmatched={driveUnmatched}
      filings={filings}
      agent={{ id: currentModelId, label: currentModel?.label ?? null, options: AGENT_MODELS.map((m) => ({ id: m.id, label: m.label })) }}
      changelogModel={changelogModel}
      retrieval={{
        configured: embeddingConfigured(),
        embedId,
        embedLabel: embedModel?.label ?? null,
        embedDims,
        embedOptions: EMBEDDING_MODELS.map((m) => ({ id: m.id, label: m.label, dims: m.dims })),
        rerankId,
        rerankOptions: RERANK_MODELS.map((m) => ({ id: m.id, label: m.label })),
        stats: retrieval,
      }}
      mcp={{ servers: mcp, budget: mcpBudget }}
    />
  );
}
