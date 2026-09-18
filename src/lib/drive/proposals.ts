import type { DriveDocKind } from "@/db/schema";

/** Rules for proposing a holding's thesis from its initiating coverage report. Pure. */
export const MIN_PROPOSED_THESIS_CHARS = 40;

export type ExistingProposal = { id: string; status: "pending" | "accepted" | "dismissed"; sourceFileId: string | null; sourceModifiedTime: Date | null; proposed: string };

export type ProposalInput = {
  holdingThesis: string | null;
  fileKind: DriveDocKind | null;
  summaryThesis: string | null;
  fileId: string;
  fileModifiedTime: Date | null;
  existing: ExistingProposal[];
};

export type ProposalDecision = { action: "create" | "update" | "none"; reason: string; pendingId?: string };

const sameTime = (a: Date | null, b: Date | null) => (a?.getTime() ?? -1) === (b?.getTime() ?? -2);

export function proposalEligibility(p: ProposalInput): ProposalDecision {
  if (p.fileKind !== "initiating_coverage") return { action: "none", reason: "not an initiating coverage report" };
  if (p.holdingThesis && p.holdingThesis.trim()) return { action: "none", reason: "holding already has a thesis" };
  const thesis = p.summaryThesis?.trim() ?? "";
  if (thesis.length < MIN_PROPOSED_THESIS_CHARS) return { action: "none", reason: "no usable thesis in the summary" };
  const dismissedSame = p.existing.some((e) => e.status === "dismissed" && e.sourceFileId === p.fileId && sameTime(e.sourceModifiedTime, p.fileModifiedTime));
  if (dismissedSame) return { action: "none", reason: "this version was dismissed" };
  const pending = p.existing.find((e) => e.status === "pending");
  if (pending) {
    if (pending.proposed.trim() === thesis) return { action: "none", reason: "already proposed" };
    return { action: "update", reason: "pending proposal replaced by a newer extraction", pendingId: pending.id };
  }
  return { action: "create", reason: "thesis extracted from the initiating coverage report" };
}
