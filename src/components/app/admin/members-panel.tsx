"use client";

import { useRef, useState } from "react";
import { DateTime } from "luxon";
import { ChevronDown, Ellipsis, Search, X } from "lucide-react";
import { removeMember, resetTestPassword, revokeInvitation, updateMember } from "@/lib/actions/admin";
import { ROLE_LABELS } from "@/lib/constants";
import type { Role } from "@/db/schema";
import { PageHero } from "@/components/app/page-head";
import { FilterChip, FilterChips } from "@/components/app/panel";
import { NativeSelect } from "@/components/app/native-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { fmtDateTime, fmtDay, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Field, RoleOptions, TeamOptions } from "./member-actions";

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

const GRID = "grid grid-cols-[minmax(0,1.3fr)_170px_minmax(0,1fr)_90px_140px_150px] items-center gap-3";

type Filter = "all" | "execs" | "leads" | "pending";

function lastActiveLabel(iso: string | null, now: DateTime): { text: string; stale: boolean } {
  if (!iso) return { text: "Never", stale: false };
  const d = DateTime.fromISO(iso, { zone: NY });
  const mins = now.diff(d, "minutes").minutes;
  const stale = now.diff(d, "days").days > STALE_DAYS;
  if (mins < 5) return { text: "Now", stale };
  if (d.hasSame(now, "day")) return { text: fmtTime(iso), stale };
  if (d.hasSame(now.minus({ days: 1 }), "day")) return { text: "Yesterday", stale };
  return { text: fmtDay(iso, now.toJSDate()), stale };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function MembersPanel({ members, invitations, teams, canMutate, meId, activityKnown, now }: MembersPanelProps) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [resetting, setResetting] = useState<MemberRow | null>(null);
  const [removing, setRemoving] = useState<MemberRow | null>(null);
  const nowDt = DateTime.fromISO(now, { zone: NY });

  const fundWide = (r: Role) => r === "exec" || r === "admin";
  const execs = members.filter((m) => fundWide(m.role)).length;
  const leads = members.filter((m) => m.role === "lead_analyst").length;
  const associates = members.filter((m) => m.role === "associate_analyst").length;

  const needle = q.trim().toLowerCase();
  const match = (...fields: (string | null)[]) => !needle || fields.some((f) => f?.toLowerCase().includes(needle));
  const shown = members.filter(
    (m) => (filter === "all" || (filter === "execs" && fundWide(m.role)) || (filter === "leads" && m.role === "lead_analyst")) && match(m.fullName, m.email, m.username, m.teamName ?? "Whole fund", ROLE_LABELS[m.role]),
  );
  const shownInvites = invitations.filter((i) => (filter === "all" || filter === "pending") && match(i.fullName, i.email, i.teamName ?? "Whole fund", ROLE_LABELS[i.role]));

  return (
    <>
      <PageHero
        label={canMutate ? "Invite-only · only admins can change anything here" : "Invite-only · execs can view; changes here are made by an admin"}
        value={plural(members.length, "member")}
        note={`${`${execs} ${execs === 1 ? "exec or admin" : "execs and admins"}`} · ${plural(leads, "lead")} · ${plural(associates, "associate")}, whose access is on hold${invitations.length > 0 ? ` · ${plural(invitations.length, "pending invitation")}` : ""}`}
      />

      <div className="mt-5 flex items-center gap-2">
        <label className="flex h-8 w-[280px] items-center gap-2 border-b border-border-strong text-muted-foreground focus-within:text-foreground">
          <Search className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a member" aria-label="Find a member" className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </label>
        <span className="flex-1" />
        <FilterChips label="Show members">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </FilterChip>
          <FilterChip active={filter === "execs"} onClick={() => setFilter("execs")}>
            Execs and admins
          </FilterChip>
          <FilterChip active={filter === "leads"} onClick={() => setFilter("leads")}>
            Leads
          </FilterChip>
          {invitations.length > 0 && (
            <FilterChip active={filter === "pending"} onClick={() => setFilter("pending")} count={invitations.length}>
              Pending
            </FilterChip>
          )}
        </FilterChips>
      </div>

      <div role="table" aria-label="Members" className="mt-3 text-body">
        <div role="row" className={cn(GRID, "h-8 border-b text-caption text-muted-foreground")}>
          <span role="columnheader">Member</span>
          <span role="columnheader">Role</span>
          <span role="columnheader">Team</span>
          <span role="columnheader">Sign-in</span>
          <span role="columnheader">Last active</span>
          <span role="columnheader">
            <span className="sr-only">Actions</span>
          </span>
        </div>
        {shown.map((m) => {
          const last = activityKnown ? lastActiveLabel(m.lastActive, nowDt) : { text: "—", stale: false };
          const test = m.kind === "password";
          return (
            <div key={m.id} role="row" className={cn(GRID, "h-[46px] border-b border-row")}>
              <span role="cell" className="flex min-w-0 flex-col">
                <span className="truncate">
                  <b className="font-semibold">{m.fullName}</b>
                  {m.id === meId && <span className="text-muted-foreground"> (you)</span>}
                  {!m.onboarded && <span className="ml-2 text-caption font-semibold text-caution-foreground">Setup pending</span>}
                </span>
                <span className="truncate text-caption text-muted-foreground" title={test ? `Username account: ${m.username}` : `Google sign-in: ${m.email}`}>
                  {test ? `Test account · never emailed · ${m.username ?? ""}` : m.email}
                  {m.role === "associate_analyst" ? " · access on hold" : ""}
                </span>
              </span>
              <span role="cell">
                {canMutate ? (
                  <Button type="button" variant="secondary" size="sm" aria-label={`${m.fullName}: ${ROLE_LABELS[m.role]}. Change role or team`} onClick={() => setEditing(m)}>
                    {ROLE_LABELS[m.role]}
                    <ChevronDown className="size-2.5" strokeWidth={2.5} aria-hidden />
                  </Button>
                ) : (
                  ROLE_LABELS[m.role]
                )}
              </span>
              <span role="cell" className="truncate text-ink-3">
                {m.teamName ?? "No team (fund-wide)"}
              </span>
              <span role="cell" className="text-ink-2">
                {test ? "Username" : "Google"}
              </span>
              <span role="cell" className={cn("truncate", last.stale ? "text-caution-foreground" : "text-ink-3")} title={m.lastActive ? `Last signed in or active ${fmtDateTime(m.lastActive)}${last.stale ? ` · not seen in over ${STALE_DAYS} days` : ""}` : undefined}>
                {last.text}
                {last.stale && <span className="sr-only"> (not seen in over {STALE_DAYS} days)</span>}
              </span>
              <span role="cell" className="flex items-center justify-end gap-1">
                {canMutate && test && (
                  <button type="button" onClick={() => setResetting(m)} className="rounded-sm text-caption text-ink-2 underline decoration-border underline-offset-2 hover:text-foreground">
                    Set password
                  </button>
                )}
                {canMutate && (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${m.fullName}`} />}>
                      <Ellipsis />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setEditing(m)}>Change role or team</DropdownMenuItem>
                      {test && <DropdownMenuItem onClick={() => setResetting(m)}>Reset password</DropdownMenuItem>}
                      {m.id !== meId && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setRemoving(m)}>
                            Remove
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </span>
            </div>
          );
        })}
        {shownInvites.map((i) => (
          <InvitationRowView key={i.id} i={i} canMutate={canMutate} />
        ))}
        {shown.length === 0 && shownInvites.length === 0 && (
          <p className="py-4 text-body text-muted-foreground">{needle ? `Nobody matches “${q}”.` : filter === "pending" ? "No pending invitations." : "Nobody here."}</p>
        )}
      </div>

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
                <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
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
                <Button type="button" variant="secondary" onClick={() => setResetting(null)}>
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
                <Button type="button" variant="secondary" onClick={() => setRemoving(null)}>
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
    </>
  );
}

/** A pending invitation is a row of the same table: nobody has signed in yet, and an admin can revoke it. */
function InvitationRowView({ i, canMutate }: { i: InvitationRow; canMutate: boolean }) {
  const revokeRef = useRef<HTMLFormElement>(null);
  return (
    <div role="row" className={cn(GRID, "h-[46px] border-b border-row")}>
      <span role="cell" className="flex min-w-0 flex-col">
        <b className="truncate font-semibold">{i.fullName ?? i.email}</b>
        <span className="truncate text-caption text-muted-foreground">
          {i.fullName ? `${i.email} · ` : ""}Invited {fmtDay(i.createdAt)}
        </span>
      </span>
      <span role="cell">{ROLE_LABELS[i.role]}</span>
      <span role="cell" className="truncate text-ink-3">
        {i.teamName ?? "No team (fund-wide)"}
      </span>
      <span role="cell" className="text-ink-2">
        Pending
      </span>
      <span role="cell" className="text-caution-foreground">
        Not signed in yet
      </span>
      <span role="cell" className="text-right">
        {canMutate && (
          <>
            <button type="button" onClick={() => revokeRef.current?.requestSubmit()} className="rounded-sm text-caption text-ink-2 underline decoration-border underline-offset-2 hover:text-foreground">
              Revoke
              <span className="sr-only"> the invitation to {i.email}</span>
            </button>
            <form ref={revokeRef} action={revokeInvitation} hidden>
              <input type="hidden" name="id" value={i.id} />
            </form>
          </>
        )}
      </span>
    </div>
  );
}
