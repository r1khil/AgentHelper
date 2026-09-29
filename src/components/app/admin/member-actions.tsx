"use client";

import { useState } from "react";
import { createTestAccount, inviteMember } from "@/lib/actions/admin";
import { ROLES, ROLE_LABELS } from "@/lib/constants";
import { NativeSelect } from "@/components/app/native-select";
import { Segmented } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TeamOption = { id: string; name: string };

/** The Members tab's two header actions: create a test account (grey) and invite a member (the one filled button). */
export function MemberActions({ teams }: { teams: TeamOption[] }) {
  const [open, setOpen] = useState<"google" | "test" | null>(null);
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen("test")}>
        Create a test account
      </Button>
      <Button type="button" onClick={() => setOpen("google")}>
        Invite a member
      </Button>
      {open && <InviteDialog key={open} initial={open} onClose={() => setOpen(null)} teams={teams} />}
    </>
  );
}

function InviteDialog({ initial, onClose, teams }: { initial: "google" | "test"; onClose: () => void; teams: TeamOption[] }) {
  const [mode, setMode] = useState<"google" | "test">(initial);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "google" ? "Invite a member" : "Create a test account"}</DialogTitle>
          <DialogDescription>
            {mode === "google" ? "They sign in with Google using this email. Adding them to the roster sends no email." : "Test accounts sign in with the username box on the login page. No email is involved."}
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

export function RoleOptions() {
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

export function TeamOptions({ teams }: { teams: TeamOption[] }) {
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

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
