import type { Metadata } from "next";
import { asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { invitations, profiles, teams } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ROLES, ROLE_LABELS } from "@/lib/constants";
import { createTestAccount, inviteMember, removeMember, revokeInvitation, updateMember } from "@/lib/actions/admin";
import { runCloseNow, runMorningNow } from "@/lib/actions/jobs";
import { jobRuns } from "@/db/schema";
import { fmtDateTime } from "@/lib/format";
import { emailConfigured } from "@/lib/jobs/notify";
import { finnhubConfigured } from "@/lib/providers/finnhub";
import { agentConfigured, agentModelId } from "@/lib/agent/model";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { NativeSelect } from "@/components/app/native-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const me = await requireAdmin();
  const { ok, error } = await searchParams;
  const runs = await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(12);
  const [allTeams, members, pending] = await Promise.all([
    db.select().from(teams).orderBy(asc(teams.sortOrder)),
    db
      .select({ p: profiles, teamName: teams.name })
      .from(profiles)
      .leftJoin(teams, eq(teams.id, profiles.teamId))
      .orderBy(asc(profiles.role), asc(profiles.fullName)),
    db.select().from(invitations).where(isNull(invitations.acceptedAt)).orderBy(desc(invitations.createdAt)),
  ]);

  const roleOptions = ROLES.map((r) => (
    <option key={r} value={r}>
      {ROLE_LABELS[r]}
    </option>
  ));
  const teamOptions = (
    <>
      <option value="">No team (fund-wide)</option>
      {allTeams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </>
  );

  return (
    <>
      <PageHeader title="Admin" description="Members, invitations, test accounts, and scheduled jobs." />
      {ok && <Notice tone="ok">{ok}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <SectionTitle aside={`Agent: ${agentConfigured() ? agentModelId() : "off"} · News: ${finnhubConfigured() ? "on" : "off"} · Email: ${emailConfigured() ? "on" : "log only"}`}>Jobs</SectionTitle>
      <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="p-4">
          <form action={runCloseNow} className="grid gap-2">
            <Label htmlFor="job-date">Close check (movements)</Label>
            <div className="flex items-center gap-2">
              <Input id="job-date" name="date" type="date" className="w-40" />
              <Button type="submit" size="sm" variant="outline">Run</Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="force" className="size-3.5" /> Re-run even if this session already completed
            </label>
            <p className="text-xs text-muted-foreground">Leave the date empty for today. Scheduled nightly at 23:00 UTC on Vercel.</p>
          </form>
          <form action={runMorningNow} className="mt-4 flex items-center justify-between gap-2 border-t pt-3">
            <span className="text-sm">Morning sweep (reminders, earnings, email)</span>
            <Button type="submit" size="sm" variant="outline">Run</Button>
          </form>
        </Card>
        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-muted-foreground">No runs yet.</TableCell></TableRow>
              ) : (
                runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.job}</TableCell>
                    <TableCell className="tnum text-muted-foreground">{fmtDateTime(r.startedAt)}</TableCell>
                    <TableCell className="max-w-md truncate text-xs text-muted-foreground" title={JSON.stringify(r.summary)}>
                      {r.finishedAt ? (r.ok ? "ok" : "failed") : "running"} · {summarize(r.summary)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <SectionTitle aside={`${members.length} members`}>Members</SectionTitle>
      <Card className="mb-8 overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Sign-in</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map(({ p }) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.fullName}
                  {p.id === me.id && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.kind === "password" ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Badge variant="secondary">username</Badge>
                      {p.username}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <Badge variant="secondary">google</Badge>
                      {p.email}
                    </span>
                  )}
                </TableCell>
                <TableCell colSpan={2}>
                  <form action={updateMember} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <NativeSelect name="role" defaultValue={p.role} className="w-40">
                      {roleOptions}
                    </NativeSelect>
                    <NativeSelect name="teamId" defaultValue={p.teamId ?? ""} className="w-56">
                      {teamOptions}
                    </NativeSelect>
                    <Button type="submit" size="sm" variant="outline">
                      Save
                    </Button>
                  </form>
                </TableCell>
                <TableCell className="text-right">
                  {p.id !== me.id && (
                    <form action={removeMember}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                        Remove
                      </Button>
                    </form>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle>Invite a member (Google sign-in)</SectionTitle>
          <Card className="p-4">
            <form action={inviteMember} className="grid gap-3">
              <Field label="Email" htmlFor="inv-email">
                <Input id="inv-email" name="email" type="email" placeholder="name@temple.edu" required />
              </Field>
              <Field label="Full name" htmlFor="inv-name">
                <Input id="inv-name" name="fullName" required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Role" htmlFor="inv-role">
                  <NativeSelect id="inv-role" name="role" defaultValue="associate_analyst">
                    {roleOptions}
                  </NativeSelect>
                </Field>
                <Field label="Team" htmlFor="inv-team">
                  <NativeSelect id="inv-team" name="teamId" defaultValue="">
                    {teamOptions}
                  </NativeSelect>
                </Field>
              </div>
              <Button type="submit" className="justify-self-start">
                Add to roster
              </Button>
            </form>
          </Card>

          {pending.length > 0 && (
            <>
              <SectionTitle aside="not yet signed in">Pending invitations</SectionTitle>
              <Card className="p-0">
                <Table>
                  <TableBody>
                    {pending.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <div className="font-medium">{i.fullName ?? i.email}</div>
                          <div className="text-xs text-muted-foreground">{i.email}</div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{ROLE_LABELS[i.role]}</TableCell>
                        <TableCell className="text-muted-foreground">{allTeams.find((t) => t.id === i.teamId)?.name ?? "Fund-wide"}</TableCell>
                        <TableCell className="text-right">
                          <form action={revokeInvitation}>
                            <input type="hidden" name="id" value={i.id} />
                            <Button type="submit" size="sm" variant="ghost">
                              Revoke
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </div>

        <div>
          <SectionTitle>Create a test account (username + password)</SectionTitle>
          <Card className="p-4">
            <form action={createTestAccount} className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Username" htmlFor="ta-user">
                  <Input id="ta-user" name="username" autoCapitalize="none" placeholder="max.lead" required />
                </Field>
                <Field label="Password" htmlFor="ta-pass">
                  <Input id="ta-pass" name="password" type="text" autoComplete="off" minLength={8} required />
                </Field>
              </div>
              <Field label="Full name" htmlFor="ta-name">
                <Input id="ta-name" name="fullName" required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Role" htmlFor="ta-role">
                  <NativeSelect id="ta-role" name="role" defaultValue="associate_analyst">
                    {roleOptions}
                  </NativeSelect>
                </Field>
                <Field label="Team" htmlFor="ta-team">
                  <NativeSelect id="ta-team" name="teamId" defaultValue={allTeams[0]?.id ?? ""}>
                    {teamOptions}
                  </NativeSelect>
                </Field>
              </div>
              <Button type="submit" className="justify-self-start">
                Create account
              </Button>
              <p className="text-xs text-muted-foreground">
                Test accounts sign in with the username box on the login page. No email is involved.
              </p>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}

function summarize(summary: Record<string, unknown>) {
  const s = summary as { status?: string; reason?: string; qualified?: string[]; created?: string[]; sessionDate?: string; reminders?: number; overdue?: number; evidenceFinished?: number };
  if (s.sessionDate) return `${s.sessionDate} ${s.status ?? ""}${s.reason ? ` (${s.reason})` : ""}${s.qualified?.length ? ` · qualified ${s.qualified.join(", ")}` : ""}`;
  if (s.reminders !== undefined) return `reminders ${s.reminders}, overdue ${s.overdue}, evidence ${s.evidenceFinished}`;
  return "";
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Notice({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  return (
    <div
      className={
        tone === "ok"
          ? "mb-4 rounded-md border border-up/30 bg-up/5 px-3 py-2 text-sm"
          : "mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      }
    >
      {children}
    </div>
  );
}
