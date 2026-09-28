"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { reviewProposal } from "@/lib/actions/models";
import { cn } from "@/lib/utils";
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
      variant="outline"
      size="lg"
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

/** The round 28px approve / reject buttons of a proposal row. */
export function DecisionButtons({ id, status, canApprove, reviewer }: { id: string; status: "proposed" | "approved" | "rejected" | "exception"; canApprove: boolean; reviewer?: string | null }) {
  const approved = status === "approved";
  const rejected = status === "rejected";
  return (
    <span className="flex justify-end gap-1.5">
      <RoundForm id={id} decision="approved" disabled={approved || !canApprove} title={approved ? `Approved${reviewer ? ` by ${reviewer}` : ""}` : canApprove ? "Approve" : "No value to approve"} active={approved} tone="good">
        <Check />
      </RoundForm>
      <RoundForm id={id} decision="rejected" disabled={rejected} title={rejected ? `Rejected${reviewer ? ` by ${reviewer}` : ""}` : "Reject"} active={rejected} tone="muted">
        <X />
      </RoundForm>
    </span>
  );
}

function RoundForm({ id, decision, disabled, title, active, tone, children }: { id: string; decision: "approved" | "rejected"; disabled: boolean; title: string; active: boolean; tone: "good" | "muted"; children: React.ReactNode }) {
  return (
    <form action={reviewProposal} title={title}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={decision} />
      <button
        type="submit"
        disabled={disabled}
        title={title}
        aria-label={title}
        aria-pressed={active}
        className={cn(
          "grid h-7 w-[30px] place-items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-3.5",
          active
            ? tone === "good"
              ? "bg-up text-card"
              : "bg-muted text-foreground"
            : "text-muted-foreground shadow-[0_0_0_1px_var(--border)] hover:text-foreground hover:shadow-[0_0_0_1px_var(--border-strong)] disabled:opacity-40",
        )}
      >
        {children}
      </button>
    </form>
  );
}

/** "Decide" on an exception: what Hoot found and why it needs judgment, with approve / reject. */
export function ExceptionDecide({ id, canApprove, children }: { id: string; canApprove: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<button type="button" className="rounded-md px-1 text-body font-semibold whitespace-nowrap hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" />}>
        Decide
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        {children}
        <div className="flex justify-end gap-2">
          <form action={reviewProposal} onSubmit={() => setOpen(false)}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="decision" value="rejected" />
            <Button type="submit" size="sm" variant="outline">
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
