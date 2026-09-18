import type { Metadata } from "next";
import { asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { invitations, profiles, teams } from "@/db/schema";
import { requireRole, transparencyEnabled } from "@/lib/auth";
import { ROLES, ROLE_LABELS } from "@/lib/constants";
import { createTestAccount, inviteMember, removeMember, revokeInvitation, updateMember } from "@/lib/actions/admin";
import { runBellwethersNow, runCloseNow, runMorningNow, runPricesNow } from "@/lib/actions/jobs";
import { disconnectDrive, setDriveRoot, syncDriveNow } from "@/lib/actions/drive";
import { driveStatus } from "@/lib/drive/index";
import { jobRuns } from "@/db/schema";
import { fmtDateTime } from "@/lib/format";
import { JobRunsLive } from "@/components/app/admin/job-runs-live";
import type { JobRunView } from "@/app/api/admin/job-runs/route";
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
// Jobs started from this page run inside its server actions; give them the same budget as the cron routes.
export const maxDuration = 300;

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  // Execs see everything an admin sees; only admins can change anything (the server actions enforce this too).
  const me = await requireRole("exec", "admin");
  const canMutate = me.role === "admin";
  const { ok, error } = await searchParams;
  const transparency = transparencyEnabled(me);
  const runRows = await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(12);
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
  const [drive, lastDriveRun] = await Promise.all([driveStatus(), db.select().from(jobRuns).where(eq(jobRuns.job, "drive_sync")).orderBy(desc(jobRuns.startedAt)).limit(1).then((r) => r[0] ?? null)]);
  const driveUnmatched = ((lastDriveRun?.summary as { unmatched?: string[] } | undefined)?.unmatched ?? []).slice(0, 12);
  const driveLabel = !drive.configured ? "off" : !drive.connected ? "not connected" : drive.needsReconnect ? "reconnect needed" : `on (${drive.fileCount} files)`;
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
      {!canMutate && <Notice tone="info">View only. Changes here are made by an admin.</Notice>}

      <SectionTitle aside={`Agent: ${agentConfigured() ? agentModelId() : "off"} · News: ${finnhubConfigured() ? "on" : "off"} · Email: ${emailConfigured() ? "on" : "log only"} · Drive: ${driveLabel}`}>Jobs</SectionTitle>
      <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {canMutate ? (
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
          <form action={runPricesNow} className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
            <span className="text-sm">Price history (attribution closes, dividends, splits)</span>
            <Button type="submit" size="sm" variant="outline">Run</Button>
          </form>
          <form action={runBellwethersNow} className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
            <span className="text-sm">Sector bellwethers (ETF constituents, earnings dates, industries)</span>
            <Button type="submit" size="sm" variant="outline">Run</Button>
          </form>
        </Card>
        ) : (
        <Card className="p-4 text-sm">
          <ul className="grid gap-2">
            <li>Close check (movements). Scheduled nightly at 23:00 UTC on Vercel.</li>
            <li className="border-t pt-2">Morning sweep (reminders, earnings, email). Scheduled at 14:00 UTC.</li>
            <li className="border-t pt-2">Price history (attribution closes, dividends, splits). Scheduled at 23:30 UTC.</li>
            <li className="border-t pt-2">Sector bellwethers (ETF constituents, earnings dates, industries). Runs inside the morning sweep.</li>
          </ul>
        </Card>
        )}
        <Card className="overflow-x-auto p-0">
          <JobRunsLive initial={runs} transparency={transparency} />
        </Card>
      </div>

      <SectionTitle aside={drive.connected ? `connected as ${drive.accountEmail}` : drive.configured ? "not connected" : "set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, DRIVE_TOKEN_KEY"}>Google Drive</SectionTitle>
      <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="p-4">
          <p className="text-sm">
            The agent reads the Fund&rsquo;s document folder (initiating reports, earnings updates, models) and files analyst uploads into it. Permissions are read everything plus add new files only: the app never edits or deletes what you put there.
          </p>
          {canMutate && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button render={<a href="/api/google/connect" />} size="sm" variant={drive.connected && !drive.needsReconnect ? "outline" : "default"} disabled={!drive.configured}>
              {drive.connected ? "Reconnect Google" : "Connect Google Drive"}
            </Button>
            {drive.connected && (
              <form action={disconnectDrive}>
                <Button type="submit" size="sm" variant="ghost" className="text-destructive">
                  Disconnect
                </Button>
              </form>
            )}
          </div>
          )}
          {canMutate && drive.connected && (
            <form action={setDriveRoot} className="mt-4 grid gap-2 border-t pt-3">
              <Label htmlFor="drive-root">Root folder (URL or id)</Label>
              <div className="flex items-center gap-2">
                <Input id="drive-root" name="root" placeholder="https://drive.google.com/drive/folders/…" defaultValue={drive.rootFolderId ?? ""} required />
                <Button type="submit" size="sm" variant="outline">
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Layout expected inside it: one folder per sector team, then one folder per company named like &ldquo;American Express (AXP)&rdquo;.</p>
            </form>
          )}
        </Card>
        <Card className="p-4 text-sm">
          {!drive.connected ? (
            <p className="text-muted-foreground">{drive.configured ? "Connect the Fund's Google account to start." : "Add the three Drive variables to the environment, redeploy, then connect."}</p>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted-foreground">Account</dt>
              <dd>{drive.accountEmail}</dd>
              <dt className="text-muted-foreground">Root folder</dt>
              <dd>
                {drive.rootFolderId ? (
                  <a href={`https://drive.google.com/drive/folders/${drive.rootFolderId}`} target="_blank" rel="noreferrer" className="hover:underline">
                    {drive.rootFolderName ?? drive.rootFolderId}
                  </a>
                ) : (
                  <span className="text-warning-foreground">not set</span>
                )}
              </dd>
              <dt className="text-muted-foreground">Indexed</dt>
              <dd className="tnum">
                {drive.fileCount} files, {drive.matchedCount} matched to holdings
              </dd>
              <dt className="text-muted-foreground">Last sync</dt>
              <dd className="tnum">{drive.lastSyncAt ? fmtDateTime(drive.lastSyncAt) : "never"}</dd>
              {drive.lastError && (
                <>
                  <dt className="text-destructive">Error</dt>
                  <dd className="text-destructive">{drive.lastError}</dd>
                </>
              )}
              {driveUnmatched.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Unmatched folders</dt>
                  <dd className="text-xs text-muted-foreground">{driveUnmatched.join(" · ")}</dd>
                </>
              )}
            </dl>
          )}
          {canMutate && drive.connected && drive.rootFolderId && (
            <form action={syncDriveNow} className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground">Also refreshes on its own before agent chats (every 10 minutes at most) and in the morning sweep.</span>
              <Button type="submit" size="sm" variant="outline">
                Sync now
              </Button>
            </form>
          )}
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
            {members.map(({ p, teamName }) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">
                  {p.fullName}
                  {p.id === me.id && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                  {!p.onboardedAt && (
                    <Badge variant="outline" className="ml-1.5 border-warning text-warning-foreground">
                      setup pending
                    </Badge>
                  )}
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
                {canMutate ? (
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
                ) : (
                  <>
                    <TableCell className="text-muted-foreground">{ROLE_LABELS[p.role]}</TableCell>
                    <TableCell className="text-muted-foreground">{teamName ?? "Fund-wide"}</TableCell>
                  </>
                )}
                <TableCell className="text-right">
                  {canMutate && p.id !== me.id && (
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
          {canMutate && (
          <>
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
          </>
          )}

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
                          {canMutate && (
                            <form action={revokeInvitation}>
                              <input type="hidden" name="id" value={i.id} />
                              <Button type="submit" size="sm" variant="ghost">
                                Revoke
                              </Button>
                            </form>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </div>

        {canMutate && (
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
        )}
      </div>
    </>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Notice({ tone, children }: { tone: "ok" | "error" | "info"; children: React.ReactNode }) {
  return (
    <div
      className={
        tone === "ok"
          ? "mb-4 rounded-md border border-up/30 bg-up/5 px-3 py-2 text-sm"
          : tone === "info"
            ? "mb-4 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            : "mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      }
    >
      {children}
    </div>
  );
}
