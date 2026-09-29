"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { reviewProposal } from "@/lib/actions/models";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function decide(id: string, decision: "approved" | "rejected") {
  const fd = new FormData();
  fd.set("id", id);
  fd.set("decision", decision);
  return reviewProposal(fd);
}

/** "Reject all": the open proposals one by one through the same review action as the row buttons. */
export function RejectAllButton({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="destructive"
      disabled={pending || !ids.length}
      onClick={() =>
        start(async () => {
          try {
            for (const id of ids) await decide(id, "rejected");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : String(e));
          }
          router.refresh();
        })
      }
    >
      {pending && <Loader2 className="animate-spin" />}
      Reject all
    </Button>
  );
}

/**
 * A proposal row's decision: Approve (filled) and Reject. Once decided, the row says so in a word and offers the
 * other choice, so a decision can be changed until the values are written.
 */
export function DecisionButtons({ id, status, canApprove, reviewer }: { id: string; status: "proposed" | "approved" | "rejected" | "exception"; canApprove: boolean; reviewer?: string | null }) {
  const approved = status === "approved";
  const rejected = status === "rejected";
  const by = reviewer ? ` by ${reviewer}` : "";
  return (
    <span className="flex items-center justify-end gap-1.5">
      {approved && (
        <span className="mr-1 text-caption font-semibold text-muted-foreground" title={`Approved${by}`}>
          Approved
        </span>
      )}
      {rejected && (
        <span className="mr-1 text-caption font-semibold text-muted-foreground" title={`Rejected${by}`}>
          Rejected
        </span>
      )}
      {!approved && <DecisionForm id={id} decision="approved" primary disabled={!canApprove} title={canApprove ? "Approve this value" : "No value to approve"} />}
      {!rejected && <DecisionForm id={id} decision="rejected" title="Reject this value" />}
    </span>
  );
}

function DecisionForm({ id, decision, primary, disabled, title }: { id: string; decision: "approved" | "rejected"; primary?: boolean; disabled?: boolean; title: string }) {
  return (
    <form action={reviewProposal}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <DecisionSubmit primary={primary} disabled={disabled} title={title}>
        {decision === "approved" ? "Approve" : "Reject"}
      </DecisionSubmit>
    </form>
  );
}

function DecisionSubmit({ primary, disabled, title, children }: { primary?: boolean; disabled?: boolean; title: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={primary ? "default" : "secondary"} disabled={disabled || pending} title={title} className="text-caption font-semibold">
      {children}
    </Button>
  );
}

/** "Decide" on an exception: what Hoot found and why it needs judgment, with approve / reject. */
export function ExceptionDecide({ id, canApprove, children }: { id: string; canApprove: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="secondary" size="sm" className="text-caption font-semibold" />}>Decide</PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        {children}
        <div className="flex justify-end gap-2">
          <form action={reviewProposal} onSubmit={() => setOpen(false)}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="decision" value="rejected" />
            <Button type="submit" size="sm" variant="secondary">
              Reject
            </Button>
          </form>
          {canApprove && (
            <form action={reviewProposal} onSubmit={() => setOpen(false)}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="decision" value="approved" />
              <Button type="submit" size="sm">
                Approve this value
              </Button>
            </form>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
