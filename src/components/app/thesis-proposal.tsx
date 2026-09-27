import type { HoldingProposal } from "@/db/schema";
import { acceptHoldingProposal, dismissHoldingProposal } from "@/lib/actions/proposals";
import { Pill } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** A thesis the app extracted from the initiating coverage report. Nothing changes until an analyst accepts it. */
export function ThesisProposal({ proposal }: { proposal: HoldingProposal }) {
  const link = proposal.sourceFileId ? `https://drive.google.com/file/d/${proposal.sourceFileId}/view` : null;
  return (
    <div className="rounded-[10px] bg-band p-3 shadow-[0_0_0_1px_var(--border)]">
      <p className="text-xs leading-relaxed text-muted-foreground">
        <Pill tone="caution" className="mr-1.5 align-middle">Proposed</Pill>
        Extracted by the app from{" "}
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
            {proposal.sourceFileName ?? "the initiating report"}
          </a>
        ) : (
          (proposal.sourceFileName ?? "the initiating report")
        )}
        . It is not yet the team&apos;s thesis; edit it if needed, then accept or dismiss.
      </p>
      <form action={acceptHoldingProposal} className="mt-2 grid gap-2">
        <input type="hidden" name="id" value={proposal.id} />
        <Textarea name="thesis" defaultValue={proposal.proposed} rows={5} className="bg-card" />
        <div className="flex items-center justify-end gap-2">
          <Button type="submit" size="sm" variant="outline" formAction={dismissHoldingProposal}>
            Dismiss
          </Button>
          <Button type="submit" size="sm">
            Accept as thesis
          </Button>
        </div>
      </form>
      {proposal.rationale && <p className="mt-2 text-xs text-muted-foreground">{proposal.rationale}</p>}
    </div>
  );
}
