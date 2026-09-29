"use client";

import { useFormStatus } from "react-dom";
import { sendWeeklyEmailNow } from "@/lib/actions/weekly";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDateTime } from "@/lib/format";
import { reviewWeek, weekRangeLabel } from "@/lib/weekly/weeks";
import type { EmailView } from "./types";

/** Who a send goes to, in the words the confirmation prints: "Aadi (apatil@…), with Saad (squddus@…) in CC". */
export function recipientsText(email: EmailView, mode: "list" | "me"): string {
  if (mode === "me") return `you (${email.me})`;
  if (!email.to) return "nobody: the list is paused";
  const name = (a: string) => email.fullNames[a.toLowerCase()] ?? email.names[a.toLowerCase()] ?? a;
  return `${name(email.to)} (${email.to})${email.cc.length ? `, with ${email.cc.map((c) => `${name(c)} (${c})`).join(", ")} in CC` : ""}`;
}

/**
 * The Sunday email goes out from here, and nothing else on the page sends it: it asks first and names who gets it.
 * Confirming submits the same action the buttons always did. "list" is the usual recipients (again, if it already went);
 * "me" is a copy to the person pressing the button, which doesn't count as the week's email.
 */
export function SendEmailDialog({ open, onOpenChange, week, email, mode }: { open: boolean; onOpenChange: (open: boolean) => void; week: string; email: EmailView; mode: "list" | "me" }) {
  const review = reviewWeek(week);
  const again = mode === "list" && email.record?.status === "ok";
  const range = weekRangeLabel(review.from, review.to);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">{mode === "me" ? `Send the ${range} pack to you?` : `${again ? "Send again: email" : "Email"} the ${range} pack?`}</DialogTitle>
          <DialogDescription>
            This emails {recipientsText(email, mode)}, through OpenMail.
            {mode === "list" && again && email.record?.at ? ` It already went out ${fmtDateTime(email.record.at)}; this sends the pack as it stands now, as a new message.` : ""}
            {mode === "me" ? " A copy to you doesn't count as the week's email." : ""}
            {mode === "list" && email.skipped.length > 0 ? ` Test accounts on the list never get it: ${email.skipped.join(", ")}.` : ""}
          </DialogDescription>
        </DialogHeader>
        <form action={sendWeeklyEmailNow}>
          <input type="hidden" name="week" value={week} />
          <input type="hidden" name="mode" value={mode} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
            <SendSubmit disabled={mode === "list" && !email.to} label={mode === "me" ? "Send to me" : again ? "Send again" : "Send"} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SendSubmit({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Sending…" : label}
    </Button>
  );
}
