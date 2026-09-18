import type { HoldingProposal } from "@/db/schema";
import { acceptHoldingProposal, dismissHoldingProposal } from "@/lib/actions/proposals";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** A thesis the app extracted from the initiating coverage report. Nothing changes until an analyst accepts it. */
export function ThesisProposal({ proposal }: { proposal: HoldingProposal }) {
  const link = proposal.sourceFileId ? `https://drive.google.com/file/d/${proposal.sourceFileId}/view` : null;
  return (
    <div className="mb-4 rounded-md border border-dashed border-warning-foreground/40 bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Proposed thesis, extracted by the app from{" "}
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="underline">
            {proposal.sourceFileName ?? "the initiating report"}
          </a>
        ) : (
          (proposal.sourceFileName ?? "the initiating report")
        )}
        . It is not yet the team&apos;s thesis; edit it if needed, then accept or dismiss.
      </p>
      <form action={acceptHoldingProposal} className="mt-2 grid gap-2">
        <input type="hidden" name="id" value={proposal.id} />
        <Textarea name="thesis" defaultValue={proposal.proposed} rows={5} />
        <div className="flex items-center justify-end gap-2">
          <Button type="submit" size="sm" variant="outline" formAction={dismissHoldingProposal}>
            Dismiss
          </Button>
          <Button type="submit" size="sm">
            Accept as thesis
          </Button>
        </div>
      </form>
      {proposal.rationale && <p className="mt-2 text-[0.7rem] text-muted-foreground">{proposal.rationale}</p>}
    </div>
  );
}
