"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { decideHootProposal } from "@/lib/actions/hoot-proposals";
import { effectiveOutcome, NOTE_MAX, PENDING_STALE_MS, type HootProposal, type ProposalOutcome, type ProposedTrade } from "@/lib/hoot/proposals";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pill, type PillTone } from "@/components/app/panel";
import { cn } from "@/lib/utils";

const STATUS: Record<ProposalOutcome["status"], { word: string; tone: PillTone }> = {
  pending: { word: "Saving", tone: "neutral" },
  done: { word: "Done", tone: "good" },
  failed: { word: "Not changed", tone: "caution" },
  cancelled: { word: "Cancelled", tone: "neutral" },
  expired: { word: "Expired", tone: "neutral" },
};

const TRADE: Record<ProposedTrade["status"], { word: string; tone: PillTone }> = {
  record: { word: "Record", tone: "ink" },
  skip: { word: "Skip", tone: "neutral" },
  held: { word: "Held", tone: "caution" },
  unreadable: { word: "Unreadable", tone: "caution" },
};

/**
 * A change Hoot proposed, waiting for the member: exactly what will change, and Confirm and Cancel. Nothing happens
 * until Confirm, which runs the page's own server action under the member's own permissions; afterwards the card says
 * how it went, and a reopened chat shows the same (the outcome is saved on the proposal, never replayed).
 */
export function ProposalCard({ chatId, toolCallId, proposal, outcome: saved, compact = false }: { chatId: string; toolCallId: string; proposal: HootProposal; outcome: ProposalOutcome | null; compact?: boolean }) {
  // What this card just did; until then, what the saved chat says (it updates when a catch-up reload brings it).
  const [outcome, setOutcome] = useState<ProposalOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState(proposal.kind === "add_note" ? proposal.body : "");
  const [busy, startTransition] = useTransition();
  // The clock the card reads expiry by: set when it mounts, and again the moment the proposal expires.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const left = Date.parse(proposal.expiresAt) - Date.now();
    if (!(left > 0)) return;
    const t = setTimeout(() => setNow(Date.now()), Math.min(left + 500, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [proposal.expiresAt]);
  const shown = effectiveOutcome(proposal, outcome ?? saved, now);
  // Failed changes wrote nothing, so they may be confirmed again.
  const open = !shown || shown.status === "failed";
  const recordable = proposal.kind === "record_trades_from_ticket" ? proposal.trades.filter((t) => t.status === "record").length : null;

  const decide = (decision: "confirm" | "cancel") =>
    startTransition(async () => {
      setError(null);
      const noteBody = decision === "confirm" && proposal.kind === "add_note" && body !== proposal.body ? body : undefined;
      const r = await decideHootProposal({ chatId, toolCallId, decision, noteBody }).catch(() => ({ ok: false as const, error: "Couldn't reach the server. Nothing was changed.", outcome: undefined }));
      if (r.outcome) setOutcome(r.outcome);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.outcome.status === "done") toast.success(r.outcome.message);
    });

  return (
    <section
      aria-label="Change Hoot proposed"
      className={cn("panel flex flex-col text-body", compact ? "mt-3" : "mt-4")}
      data-proposal={proposal.kind}
    >
      <div className="flex items-center gap-2 border-b px-3.5 py-2.5">
        <span className="min-w-0 flex-1 font-semibold">{proposal.summary}</span>
        {shown && <Pill tone={STATUS[shown.status].tone}>{STATUS[shown.status].word}</Pill>}
      </div>

      <div className="flex flex-col gap-2 px-3.5 py-3">
        {proposal.kind === "add_note" &&
          (open ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-caption text-muted-foreground">Note on {proposal.ticker}, saved as yours. Edit it before confirming.</span>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={NOTE_MAX} disabled={busy} className="min-h-20 text-body md:text-body" aria-label={`Note on ${proposal.ticker}`} />
            </label>
          ) : (
            <p className="whitespace-pre-wrap text-ink-2">{shown?.detail ?? proposal.body}</p>
          ))}

        {proposal.kind === "pin_chat" && (
          <p className="text-ink-2">
            This conversation moves onto {proposal.ticker}&apos;s research board, where the {proposal.teamName} team sees it, and opens there from now on.
          </p>
        )}

        {proposal.kind === "dismiss_nudge" && <p className="text-ink-2">Hoot stops showing you “{proposal.title}”. Nothing else changes.</p>}

        {proposal.kind === "record_trades_from_ticket" && (
          <>
            <ul className="flex flex-col">
              {proposal.trades.map((t, i) => (
                <li key={i} className="flex items-baseline gap-2.5 border-b border-row py-1.5 last:border-b-0">
                  <Pill tone={TRADE[t.status].tone} className="w-[72px]">
                    {TRADE[t.status].word}
                  </Pill>
                  <span className="min-w-0 flex-1">
                    <span className="block">{t.line}</span>
                    {(t.reason || t.warnings?.length) && <span className="block text-caption text-muted-foreground">{[t.reason, ...(t.warnings ?? [])].filter(Boolean).join(" ")}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-caption text-muted-foreground">
              From the ticket text you pasted (#{proposal.ticketHash}). Confirm checks the ledger again and records only the trades marked Record, as you.
            </p>
          </>
        )}

        {shown && shown.status !== "cancelled" && (
          <p className={cn("text-body", shown.status === "failed" ? "font-medium text-caution-foreground" : "text-ink-2")}>
            {shown.status === "pending" && now - Date.parse(shown.at) > PENDING_STALE_MS ? "This may not have finished. Check the page it changes before asking Hoot again." : shown.message}
            {shown.href && (
              <>
                {" "}
                <Link href={shown.href} className="font-semibold text-foreground underline-offset-2 hover:underline">
                  Open the board
                </Link>
              </>
            )}
          </p>
        )}
        {error && error !== shown?.message && <p className="font-medium text-caution-foreground">{error}</p>}
      </div>

      {open && (
        <div className="flex items-center gap-2 border-t px-3.5 py-2.5">
          <Button size="sm" onClick={() => decide("confirm")} disabled={busy || (proposal.kind === "add_note" && !body.trim()) || recordable === 0}>
            {busy ? "Saving…" : shown?.status === "failed" ? "Try again" : "Confirm"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => decide("cancel")} disabled={busy}>
            Cancel
          </Button>
          <span className="min-w-0 flex-1 truncate text-right text-caption text-muted-foreground">Nothing changes until you confirm.</span>
        </div>
      )}
    </section>
  );
}
