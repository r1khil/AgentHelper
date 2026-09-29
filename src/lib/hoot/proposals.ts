// Changes Hoot may propose to a member's data, and what became of each. Pure and client-safe.
//
// Hoot never writes: a proposal tool checks the request and returns the exact change as `data.proposal` on its tool
// part. The chat draws it as a card; only the member's own click on Confirm runs the app's existing server action
// for that change (with that action's own permission checks), and the result is stored on the same tool part as
// `data.outcome`, so a reopened chat shows "Done" or "Cancelled", never runs it again, and Hoot reads the outcome with
// the rest of the conversation on the next turn. Unlike navigate and set_theme (./app-actions.ts), nothing here ever
// runs as it streams in.

export const PROPOSAL_TOOLS = ["add_note", "pin_chat", "dismiss_nudge", "record_trades_from_ticket"] as const;
export type ProposalKind = (typeof PROPOSAL_TOOLS)[number];

/** A proposal nobody decided on within this long can no longer be confirmed; the member asks again. */
export const PROPOSAL_TTL_MS = 60 * 60_000;
/** A confirmed change still "pending" after this long never finished saving its result (the server stopped). */
export const PENDING_STALE_MS = 5 * 60_000;

/** One trade read from pasted ticket text, as the card shows it. */
export type ProposedTrade = {
  /** "Bought 83 SYK (Stryker Corp) at $280.13 on Sep 18, 2026", or the ticket's label when it couldn't be read. */
  line: string;
  /** record: goes into the ledger on Confirm. skip: already counted. held: priced far from that day's close, so it is
   * left for the Ledger page. unreadable: the text isn't a complete ticket. */
  status: "record" | "skip" | "held" | "unreadable";
  reason?: string;
  warnings?: string[];
};

type Base = {
  /** The member who asked; only they can confirm it. */
  forUserId: string;
  /** What will change, in one line. */
  summary: string;
  /** ISO time after which Confirm is refused. */
  expiresAt: string;
};

export type HootProposal =
  | (Base & { kind: "add_note"; holdingId: string; ticker: string; teamName: string; body: string })
  | (Base & { kind: "pin_chat"; chatId: string; ticker: string; teamSlug: string; teamName: string })
  | (Base & { kind: "dismiss_nudge"; nudgeId: string; title: string })
  | (Base & { kind: "record_trades_from_ticket"; tickets: string[]; ticketHash: string; trades: ProposedTrade[] });

export type ProposalOutcome = {
  /** pending: confirmed and being made. failed: nothing was written; it can be confirmed again. expired is never
   * stored: it is how an undecided proposal past its time reads (see effectiveOutcome). */
  status: "pending" | "done" | "failed" | "cancelled" | "expired";
  message: string;
  /** What was saved when it differs from the proposal (a note the member edited before confirming). */
  detail?: string;
  /** Where to see the change (the research board a chat was pinned to). */
  href?: string;
  /** ISO time and the member who decided. */
  at: string;
  by: string;
};

export type ProposalData = { proposal: HootProposal; note: string; outcome?: ProposalOutcome };

type PartLike = { type: string; toolCallId?: string; state?: string; output?: unknown };

export const isProposalTool = (name: string): name is ProposalKind => (PROPOSAL_TOOLS as readonly string[]).includes(name);

/** The proposal a finished proposal tool call carries, with its outcome so far. */
export function proposalOfPart(p: PartLike): { toolCallId: string; proposal: HootProposal; outcome: ProposalOutcome | null } | null {
  if (!p.type.startsWith("tool-") || p.state !== "output-available" || !p.toolCallId) return null;
  const kind = p.type.slice("tool-".length);
  if (!isProposalTool(kind)) return null;
  const data = (p.output as { data?: Partial<ProposalData> } | null)?.data;
  const proposal = data?.proposal;
  if (!proposal || typeof proposal !== "object" || proposal.kind !== kind || typeof proposal.forUserId !== "string") return null;
  return { toolCallId: p.toolCallId, proposal, outcome: data.outcome ?? null };
}

export function proposalsOf(parts: PartLike[]) {
  return parts.flatMap((p) => {
    const found = proposalOfPart(p);
    return found ? [found] : [];
  });
}

const expired = (p: HootProposal, now: number) => !(Date.parse(p.expiresAt) > now);

/** How a proposal stands now: its saved outcome, or "expired" once nobody decided in time, or null (awaiting a decision). */
export function effectiveOutcome(p: HootProposal, outcome: ProposalOutcome | null, now = Date.now()): ProposalOutcome | null {
  if (outcome) return outcome;
  return expired(p, now) ? { status: "expired", message: "This expired before anyone confirmed it. Nothing was changed; ask Hoot again.", at: p.expiresAt, by: "" } : null;
}

/**
 * Whether a Confirm or Cancel may go ahead: only on a proposal nobody has decided, that hasn't expired, or whose change
 * failed (nothing was written, so it can be tried again or put away). A pending change is never re-run, even when it
 * went stale: it may have been made.
 */
export function canDecide(p: HootProposal, outcome: ProposalOutcome | null, now = Date.now()): { ok: true } | { ok: false; error: string } {
  if (outcome?.status === "done") return { ok: false, error: "This change was already made." };
  if (outcome?.status === "cancelled") return { ok: false, error: "This change was cancelled." };
  if (outcome?.status === "pending") return { ok: false, error: "This change is already being made." };
  if (!outcome && expired(p, now)) return { ok: false, error: "This expired before anyone confirmed it. Ask Hoot again." };
  return { ok: true };
}

/** The parts with one proposal's outcome set, or null when that proposal isn't among them. Never mutates. */
export function withOutcome<P extends PartLike>(parts: P[], toolCallId: string, outcome: ProposalOutcome): P[] | null {
  let found = false;
  const next = parts.map((p) => {
    if (p.toolCallId !== toolCallId || !proposalOfPart(p)) return p;
    found = true;
    const output = p.output as { data: ProposalData };
    return { ...p, output: { ...output, data: { ...output.data, outcome } } };
  });
  return found ? next : null;
}

/** Every outcome recorded in these parts, by tool call. */
export function outcomesOf(parts: PartLike[]): Map<string, ProposalOutcome> {
  const out = new Map<string, ProposalOutcome>();
  for (const p of proposalsOf(parts)) if (p.outcome) out.set(p.toolCallId, p.outcome);
  return out;
}

/**
 * Saved outcomes win over the copy being saved. A turn holds the chat's messages from when it started and saves them
 * again as it goes; without this, a Confirm clicked while the answer was still streaming (or during a later turn) would
 * be overwritten by that older copy, and a reopened chat would offer the same change again.
 */
export function carryOutcomes<M extends { parts: PartLike[] }>(messages: M[], saved: Map<string, ProposalOutcome>): M[] {
  if (!saved.size) return messages;
  return messages.map((m) => {
    let parts = m.parts;
    for (const p of proposalsOf(m.parts)) {
      const s = saved.get(p.toolCallId);
      if (s && (p.outcome?.status !== s.status || p.outcome?.at !== s.at)) parts = withOutcome(parts, p.toolCallId, s) ?? parts;
    }
    return parts === m.parts ? m : { ...m, parts };
  });
}

/**
 * The conversation as Hoot reads it on the next turn: an undecided proposal past its time reads "expired", so he
 * neither re-offers a card the member can still act on nor claims a change the member never confirmed.
 */
export function withExpiredProposals<M extends { parts: PartLike[] }>(messages: M[], now = Date.now()): M[] {
  return messages.map((m) => {
    let parts = m.parts;
    for (const p of proposalsOf(m.parts)) {
      const o = effectiveOutcome(p.proposal, p.outcome, now);
      if (o && !p.outcome) parts = withOutcome(parts, p.toolCallId, o) ?? parts;
    }
    return parts === m.parts ? m : { ...m, parts };
  });
}

/**
 * Which changes the member's latest message asks for, so Hoot is only handed those tools. Text Hoot reads (a page, a
 * filing, a document) can never offer him one: only the member's own words can.
 */
export function proposalToolsFor(latestMemberText: string): ProposalKind[] {
  const t = latestMemberText;
  const out: ProposalKind[] = [];
  if (/\bnotes?\b|\bjot\b|\bwrite (?:this|that|it) down\b/i.test(t)) out.push("add_note");
  if (/\bpin\b|\b(?:file|move|put|save|add)\b[^.?!\n]{0,40}\b(?:board|research board)\b/i.test(t)) out.push("pin_chat");
  if (/\b(?:dismiss|hide|clear|mute|snooze)\b|\bstop (?:showing|reminding|nagging)\b|\bdon[’']?t (?:show|remind)\b|\bnudges?\b|\breminders?\b/i.test(t)) out.push("dismiss_nudge");
  if (/\b(?:record|log|enter|book|add|put)\b[^.?!\n]{0,60}\b(?:trades?|tickets?|ledger)\b|\b(?:trades?|tickets?)\b[^.?!\n]{0,40}\b(?:into|in|to) the ledger\b/i.test(t)) out.push("record_trades_from_ticket");
  return out;
}

export const NOTE_MAX = 2000;

/** A note's text as it will be saved, or why it can't be. */
export function cleanNoteBody(text: string): { body: string } | { error: string } {
  const body = String(text ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!body) return { error: "The note is empty. Say what it should say." };
  if (body.length > NOTE_MAX) return { error: `Notes added from a chat are at most ${NOTE_MAX} characters; this one is ${body.length}. Shorten it, or add it on the holding's page.` };
  return { body };
}

/** Nudges matching what the member called one: its exact id, else every word they used in its title. */
export function matchNudges<N extends { id: string; title: string }>(query: string, nudges: N[]): N[] {
  const q = query.trim();
  const exact = nudges.filter((n) => n.id === q);
  if (exact.length) return exact;
  const words = q.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 2 && !NUDGE_FILLER.has(w));
  if (!words.length) return [];
  return nudges.filter((n) => {
    const title = ` ${n.title.toLowerCase().replace(/[^a-z0-9 ]/g, " ")} `;
    return words.every((w) => title.includes(` ${w}`));
  });
}

const NUDGE_FILLER = new Set(["the", "about", "nudge", "nudges", "reminder", "reminders", "remind", "me", "my", "dismiss", "hide", "stop", "that", "this", "one", "for", "of", "please", "clear"]);
