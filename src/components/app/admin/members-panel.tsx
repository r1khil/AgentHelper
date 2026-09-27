"use client";

import { useRef, useState } from "react";
import { DateTime } from "luxon";
import { Ellipsis, KeyRound, Search, Trash2, UserCog, UserPlus, X } from "lucide-react";
import { createTestAccount, inviteMember, removeMember, resetTestPassword, revokeInvitation, updateMember } from "@/lib/actions/admin";
import { ROLES, ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@/db/schema";
import { Panel, Pill, Segmented, type PillTone } from "@/components/app/panel";
import { NativeSelect } from "@/components/app/native-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const NY = "America/New_York";
/** Not seen for longer than this reads as stale. */
const STALE_DAYS = 5;

export type MemberRow = {
  id: string;
  fullName: string;
  email: string;
  username: string | null;
  kind: "google" | "password";
  role: Role;
  teamId: string | null;
  teamName: string | null;
  onboarded: boolean;
  /** Last sign-in or session refresh (ISO); null when never signed in or unknown. */
  lastActive: string | null;
};

export type InvitationRow = { id: string; email: string; fullName: string | null; role: Role; teamName: string | null; createdAt: string };

export type MembersPanelProps = {
  members: MemberRow[];
  invitations: InvitationRow[];
  teams: { id: string; name: string }[];
  canMutate: boolean;
  meId: string;
  /** False when the app could not read sign-in times; the column then shows "—". */
  activityKnown: boolean;
  /** For "Today 7:32" and staleness; the server's clock. */
  now: string;
};

const GRID = "grid grid-cols-[minmax(0,1fr)_minmax(0,200px)_130px_120px_28px] items-center gap-3";

export function roleTone(role: Role): PillTone {
  return role === "exec" || role === "admin" ? "ink" : role === "lead_analyst" ? "info" : "neutral";
}

function initials(name: string) {
  return (
    name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function lastActiveLabel(iso: string | null, now: DateTime): { text: string; stale: boolean } {
  if (!iso) return { text: "Never", stale: false };
  const d = DateTime.fromISO(iso, { zone: NY });
  const mins = now.diff(d, "minutes").minutes;
  const stale = now.diff(d, "days").days > STALE_DAYS;
  if (mins < 5) return { text: "Now", stale };
  if (d.hasSame(now, "day")) return { text: `Today ${d.toFormat("h:mm")}`, stale };
  if (d.hasSame(now.minus({ days: 1 }), "day")) return { text: "Yesterday", stale };
  return { text: d.hasSame(now, "year") ? d.toFormat("LLL d") : d.toFormat("LLL d, yyyy"), stale };
}

export function MembersPanel({ members, invitations, teams, canMutate, meId, activityKnown, now }: MembersPanelProps) {
  const [q, setQ] = useState("");
  const [invite, setInvite] = useState(false);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [resetting, setResetting] = useState<MemberRow | null>(null);
  const [removing, setRemoving] = useState<MemberRow | null>(null);
  const nowDt = DateTime.fromISO(now, { zone: NY });

  const needle = q.trim().toLowerCase();
  const match = (...fields: (string | null)[]) => !needle || fields.some((f) => f?.toLowerCase().includes(needle));
  const shown = members.filter((m) => match(m.fullName, m.email, m.username, m.teamName ?? "Whole fund", ROLE_LABELS[m.role]));
  const shownInvites = invitations.filter((i) => match(i.fullName, i.email, i.teamName ?? "Whole fund", ROLE_LABELS[i.role]));

  return (
    <Panel className="min-h-[420px] lg:min-h-0">
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b px-4">
        <h2 className="text-[14.5px] font-semibold">Members</h2>
        <span className="font-mono text-xs text-muted-foreground">{members.length}</span>
        <span className="flex-1" />
        <label className="flex h-8 w-[220px] items-center gap-1.5 rounded-full bg-card px-3 shadow-[0_0_0_1px_var(--border)] focus-within:shadow-[0_0_0_1px_var(--border-strong)]">
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a member" aria-label="Find a member" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </label>
        {canMutate && (
          <Button onClick={() => setInvite(true)}>
            <UserPlus data-icon="inline-start" />
            Invite
          </Button>
        )}
      </div>
      <div className={cn(GRID, "h-[34px] shrink-0 border-b px-4 text-xs text-muted-foreground")}>
        <span>Name</span>
        <span>Team</span>
        <span>Role</span>
        <span>Last active</span>
        <span />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {shown.map((m) => {
          const last = activityKnown ? lastActiveLabel(m.lastActive, nowDt) : { text: "—", stale: false };
          const fundWide = m.role === "exec" || m.role === "admin";
          return (
            <div key={m.id} className={cn(GRID, "min-h-11 flex-1 border-b border-row px-4 text-[13.5px] hover:bg-band")}>
              <span className="flex min-w-0 items-center gap-2.5">
                <span className={cn("grid size-[26px] shrink-0 place-items-center rounded-full text-[10.5px] font-semibold", fundWide ? "bg-avatar text-cream-foreground" : "bg-muted text-ink-2")}>{initials(m.fullName)}</span>
                <span className="shrink-0 font-medium">{m.fullName}</span>
                {m.id === meId && <span className="shrink-0 text-xs text-muted-foreground">(you)</span>}
                <span className="min-w-0 truncate text-xs text-muted-foreground" title={m.kind === "password" ? `Username account: ${m.username}` : `Google sign-in: ${m.email}`}>
                  {m.kind === "password" ? `username ${m.username ?? ""}` : m.email}
                </span>
                {!m.onboarded && <Pill tone="caution">Setup pending</Pill>}
              </span>
              <span className="truncate text-ink-2">{m.teamName ?? "Whole fund"}</span>
              <span>
                <Pill tone={roleTone(m.role)}>{ROLE_LABELS[m.role]}</Pill>
              </span>
              <span className={cn("text-[12.5px]", last.stale ? "text-hoot-foreground" : "text-muted-foreground")} title={m.lastActive ? `Last signed in or active ${DateTime.fromISO(m.lastActive, { zone: NY }).toFormat("LLL d, yyyy h:mm a")} New York` : undefined}>
                {last.text}
              </span>
              {canMutate ? (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${m.fullName}`} />}>
                    <Ellipsis />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setEditing(m)}>
                      <UserCog />
                      Change role or team
                    </DropdownMenuItem>
                    {m.kind === "password" && (
                      <DropdownMenuItem onClick={() => setResetting(m)}>
                        <KeyRound />
                        Reset password
                      </DropdownMenuItem>
                    )}
                    {m.id !== meId && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setRemoving(m)}>
                          <Trash2 />
                          Remove
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span />
              )}
            </div>
          );
        })}
        {shownInvites.length > 0 && (
          <>
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-row bg-band px-4 text-[12.5px]">
              <span className="font-semibold">Pending invitations</span>
              <span className="font-mono text-[11px] text-muted-foreground">{shownInvites.length}</span>
              <span className="text-muted-foreground">· not yet signed in</span>
            </div>
            {shownInvites.map((i) => (
              <InvitationRowView key={i.id} i={i} canMutate={canMutate} />
            ))}
          </>
        )}
        {shown.length === 0 && shownInvites.length === 0 && <p className="p-4 text-[13px] text-muted-foreground">Nobody matches &ldquo;{q}&rdquo;.</p>}
      </div>

      {canMutate && <InviteDialog open={invite} onOpenChange={setInvite} teams={teams} />}
      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Change {editing.fullName}&apos;s role or team</DialogTitle>
            </DialogHeader>
            <form action={updateMember} className="grid gap-3">
              <input type="hidden" name="id" value={editing.id} />
              <Field label="Role" htmlFor="edit-role">
                <NativeSelect id="edit-role" name="role" defaultValue={editing.role}>
                  <RoleOptions />
                </NativeSelect>
              </Field>
              <Field label="Team" htmlFor="edit-team">
                <NativeSelect id="edit-team" name="teamId" defaultValue={editing.teamId ?? ""}>
                  <TeamOptions teams={teams} />
                </NativeSelect>
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {resetting && (
        <Dialog open onOpenChange={(o) => !o && setResetting(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reset {resetting.fullName}&apos;s password</DialogTitle>
              <DialogDescription>Username account {resetting.username}. They sign in with the username box on the login page.</DialogDescription>
            </DialogHeader>
            <form action={resetTestPassword} className="grid gap-3">
              <input type="hidden" name="id" value={resetting.id} />
              <Field label="New password (8 characters or more)" htmlFor="reset-pass">
                <Input id="reset-pass" name="password" type="text" autoComplete="off" minLength={8} required />
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setResetting(null)}>
                  Cancel
                </Button>
                <Button type="submit">Set password</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {removing && (
        <Dialog open onOpenChange={(o) => !o && setRemoving(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Remove {removing.fullName}?</DialogTitle>
              <DialogDescription>Their account and profile are deleted. They can be invited again later.</DialogDescription>
            </DialogHeader>
            <form action={removeMember}>
              <input type="hidden" name="id" value={removing.id} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRemoving(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive">
                  Remove
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </Panel>
  );
}

function InvitationRowView({ i, canMutate }: { i: InvitationRow; canMutate: boolean }) {
  const revokeRef = useRef<HTMLFormElement>(null);
  return (
    <div className={cn(GRID, "min-h-11 flex-1 border-b border-row px-4 text-[13.5px] hover:bg-band")}>
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-[26px] shrink-0 place-items-center rounded-full text-[10.5px] font-semibold text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]">{initials(i.fullName ?? i.email)}</span>
        <span className="shrink-0 font-medium">{i.fullName ?? i.email}</span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{i.email}</span>
      </span>
      <span className="truncate text-ink-2">{i.teamName ?? "Whole fund"}</span>
      <span>
        <Pill tone={roleTone(i.role)}>{ROLE_LABELS[i.role]}</Pill>
      </span>
      <span className="text-[12.5px] text-muted-foreground">Invited {DateTime.fromISO(i.createdAt, { zone: NY }).toFormat("LLL d")}</span>
      {canMutate ? (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for the invitation to ${i.email}`} />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => revokeRef.current?.requestSubmit()}>
                <X />
                Revoke invitation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <form ref={revokeRef} action={revokeInvitation} hidden>
            <input type="hidden" name="id" value={i.id} />
          </form>
        </>
      ) : (
        <span />
      )}
    </div>
  );
}

function InviteDialog({ open, onOpenChange, teams }: { open: boolean; onOpenChange: (o: boolean) => void; teams: { id: string; name: string }[] }) {
  const [mode, setMode] = useState<"google" | "test">("google");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "google" ? "Invite a member" : "Create a test account"}</DialogTitle>
          <DialogDescription>
            {mode === "google" ? "They sign in with Google using this email." : "Test accounts sign in with the username box on the login page. No email is involved."}
          </DialogDescription>
        </DialogHeader>
        <Segmented
          label="Account kind"
          segments={[
            { key: "google", label: "Google sign-in", active: mode === "google", onClick: () => setMode("google") },
            { key: "test", label: "Username + password", active: mode === "test", onClick: () => setMode("test") },
          ]}
          className="self-start"
        />
        {mode === "google" ? (
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
                  <RoleOptions />
                </NativeSelect>
              </Field>
              <Field label="Team" htmlFor="inv-team">
                <NativeSelect id="inv-team" name="teamId" defaultValue="">
                  <TeamOptions teams={teams} />
                </NativeSelect>
              </Field>
            </div>
            <DialogFooter>
              <Button type="submit">Add to roster</Button>
            </DialogFooter>
          </form>
        ) : (
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
                  <RoleOptions />
                </NativeSelect>
              </Field>
              <Field label="Team" htmlFor="ta-team">
                <NativeSelect id="ta-team" name="teamId" defaultValue={teams[0]?.id ?? ""}>
                  <TeamOptions teams={teams} />
                </NativeSelect>
              </Field>
            </div>
            <DialogFooter>
              <Button type="submit">Create account</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RoleOptions() {
  return (
    <>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </>
  );
}

function TeamOptions({ teams }: { teams: { id: string; name: string }[] }) {
  return (
    <>
      <option value="">No team (fund-wide)</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
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
