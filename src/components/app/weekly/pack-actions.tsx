"use client";

import { useRef, useState } from "react";
import { Ellipsis } from "lucide-react";
import { buildWeeklyNow, markWeeklySent, reopenWeekly } from "@/lib/actions/weekly";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { PackStatus } from "@/lib/weekly/status";
import { CopyButton } from "./copy-button";
import { SendEmailDialog } from "./send-email-dialog";
import type { EmailView } from "./types";

/**
 * The pack's actions in the page header. Copy email is the quiet one. The filled one is the next step for this pack: reopen
 * it when it is locked; otherwise send it (which asks first), or lock it once the email has gone; with no list to send to,
 * mark it sent. The rest are under the more menu.
 */
export function PackActions({ week, locked, state, email, whole }: { week: string; locked: boolean; state: PackStatus; email: EmailView | null; whole: string }) {
  const [dialog, setDialog] = useState<"list" | "me" | null>(null);
  const markRef = useRef<HTMLFormElement>(null);
  const rebuildRef = useRef<HTMLFormElement>(null);
  const emailed = email?.record?.status === "ok";
  const first = email?.to ? (email.names[email.to.toLowerCase()] ?? email.to) : null;

  return (
    <>
      {email && <CopyButton text={email.text} label="Copy email" variant="outline" size="default" />}
      {locked ? (
        <Button type="button" onClick={() => markRef.current?.requestSubmit()}>
          Reopen for edits
        </Button>
      ) : email?.to && !emailed && state !== "sent" ? (
        <Button type="button" onClick={() => setDialog("list")}>
          Send to {first}…
        </Button>
      ) : (
        <Button type="button" onClick={() => markRef.current?.requestSubmit()}>
          {state === "sent" ? "Lock edits" : "Mark sent"}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button size="icon" variant="ghost" aria-label="More pack actions" />}>
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => void navigator.clipboard?.writeText(whole).catch(() => {})}>Copy whole pack</DropdownMenuItem>
          {email && <DropdownMenuItem onClick={() => setDialog("me")}>Send a copy to me…</DropdownMenuItem>}
          {email?.to && (emailed || state === "sent") && <DropdownMenuItem onClick={() => setDialog("list")}>Send again…</DropdownMenuItem>}
          <DropdownMenuItem onClick={() => rebuildRef.current?.requestSubmit()}>Rebuild the pack</DropdownMenuItem>
          {!locked && (email?.to && !emailed && state !== "sent" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => markRef.current?.requestSubmit()}>Mark sent without emailing</DropdownMenuItem>
            </>
          ) : null)}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Marking sent locks the pack; rebuilding never emails. */}
      <form ref={markRef} action={locked ? reopenWeekly : markWeeklySent} hidden>
        <input type="hidden" name="week" value={week} />
      </form>
      <form ref={rebuildRef} action={buildWeeklyNow} hidden>
        <input type="hidden" name="week" value={week} />
      </form>
      {email && <SendEmailDialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)} week={week} email={email} mode={dialog ?? "list"} />}
    </>
  );
}
