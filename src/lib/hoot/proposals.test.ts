import { describe, expect, it } from "vitest";
import { seenActions, takeNewActions } from "./app-actions";
import {
  canDecide,
  carryOutcomes,
  cleanNoteBody,
  effectiveOutcome,
  matchNudges,
  NOTE_MAX,
  outcomesOf,
  proposalOfPart,
  proposalsOf,
  proposalToolsFor,
  withExpiredProposals,
  withOutcome,
  type HootProposal,
  type ProposalOutcome,
} from "./proposals";

const T0 = Date.parse("2026-09-29T15:00:00Z");
const note: HootProposal = {
  kind: "add_note",
  forUserId: "u1",
  summary: "Add a note to AXP (FIG)",
  expiresAt: new Date(T0 + 3600_000).toISOString(),
  holdingId: "h1",
  ticker: "AXP",
  teamName: "FIG",
  body: "Management guided to 8% revenue growth.",
};
const part = (p: HootProposal, outcome?: ProposalOutcome, toolCallId = "call-1") => ({
  type: `tool-${p.kind}`,
  toolCallId,
  state: "output-available",
  input: {},
  output: { data: { proposal: p, note: "Proposed, not done", ...(outcome ? { outcome } : {}) }, sources: [] },
});
const done: ProposalOutcome = { status: "done", message: "Note added to AXP.", at: new Date(T0 + 60_000).toISOString(), by: "u1" };
const pending: ProposalOutcome = { status: "pending", message: "Making the change…", at: new Date(T0 + 30_000).toISOString(), by: "u1" };

describe("proposalOfPart", () => {
  it("reads a finished proposal tool call", () => {
    expect(proposalOfPart(part(note))).toMatchObject({ toolCallId: "call-1", proposal: { kind: "add_note", body: note.body }, outcome: null });
    expect(proposalOfPart(part(note, done))?.outcome).toEqual(done);
  });
  it("ignores other tools, unfinished calls, refusals and a proposal under the wrong tool name", () => {
    expect(proposalOfPart({ ...part(note), type: "tool-navigate" })).toBeNull();
    expect(proposalOfPart({ ...part(note), state: "input-available" })).toBeNull();
    expect(proposalOfPart({ type: "tool-add_note", toolCallId: "x", state: "output-available", output: { data: null, error: "no" } })).toBeNull();
    expect(proposalOfPart({ ...part(note), type: "tool-record_trades_from_ticket" })).toBeNull();
  });
});

describe("replay safety", () => {
  it("never treats a proposal as an app action, so nothing runs when it streams in or a chat reopens", () => {
    const messages = [{ parts: [part(note), part({ ...note, kind: "add_note" }, undefined, "call-2")] }];
    expect(takeNewActions(messages, new Set())).toEqual([]);
    expect(seenActions(messages).size).toBe(0);
  });
});

describe("canDecide", () => {
  it("allows a fresh proposal and a failed one, nothing else", () => {
    expect(canDecide(note, null, T0)).toEqual({ ok: true });
    expect(canDecide(note, { ...done, status: "failed", message: "x" }, T0)).toEqual({ ok: true });
    expect(canDecide(note, done, T0).ok).toBe(false);
    expect(canDecide(note, { ...done, status: "cancelled" }, T0).ok).toBe(false);
  });
  it("never re-runs a pending change, even long after", () => {
    expect(canDecide(note, pending, T0 + 60_000).ok).toBe(false);
    expect(canDecide(note, pending, T0 + 24 * 3600_000).ok).toBe(false);
  });
  it("refuses an undecided proposal past its time", () => {
    expect(canDecide(note, null, T0 + 3600_001)).toMatchObject({ ok: false, error: expect.stringMatching(/expired/) });
    expect(effectiveOutcome(note, null, T0 + 3600_001)?.status).toBe("expired");
    expect(effectiveOutcome(note, null, T0)).toBeNull();
    // A decided proposal keeps its outcome after the deadline.
    expect(effectiveOutcome(note, done, T0 + 10 * 3600_000)).toEqual(done);
  });
});

describe("outcomes on tool parts", () => {
  it("sets one proposal's outcome without touching the rest", () => {
    const parts = [{ type: "text", text: "hi" }, part(note), part(note, undefined, "call-2")];
    const next = withOutcome(parts, "call-2", done)!;
    expect(outcomesOf(next)).toEqual(new Map([["call-2", done]]));
    expect(next[0]).toBe(parts[0]);
    expect(next[1]).toBe(parts[1]);
    expect(outcomesOf(parts).size).toBe(0);
    expect(withOutcome(parts, "missing", done)).toBeNull();
  });

  it("keeps a saved Confirm when a turn saves its older copy of the chat", () => {
    const older = [{ id: "a1", parts: [part(note)] }];
    const saved = new Map([["call-1", done]]);
    const merged = carryOutcomes(older, saved);
    expect(proposalsOf(merged[0].parts)[0].outcome).toEqual(done);
    // A pending copy loses to the saved result too.
    expect(proposalsOf(carryOutcomes([{ id: "a1", parts: [part(note, pending)] }], saved)[0].parts)[0].outcome).toEqual(done);
    // Nothing saved: the same array back.
    expect(carryOutcomes(older, new Map())).toBe(older);
  });

  it("shows Hoot an expired proposal as expired on the next turn, and leaves decided ones alone", () => {
    const messages = [{ parts: [part(note), part(note, done, "call-2")] }];
    const later = withExpiredProposals(messages, T0 + 2 * 3600_000);
    expect(proposalsOf(later[0].parts).map((p) => p.outcome?.status)).toEqual(["expired", "done"]);
    expect(withExpiredProposals(messages, T0)[0]).toBe(messages[0]);
  });
});

describe("proposalToolsFor", () => {
  it("offers only the change the member's own words ask for", () => {
    expect(proposalToolsFor("add a note to AXP that management guided to 8% revenue growth")).toEqual(["add_note"]);
    expect(proposalToolsFor("pin this chat to META's board")).toEqual(["pin_chat"]);
    expect(proposalToolsFor("stop reminding me about the SYK write-up")).toEqual(["dismiss_nudge"]);
    expect(proposalToolsFor("record this trade in the ledger:\nAction (Buy, Sell): Buy")).toEqual(["record_trades_from_ticket"]);
  });
  it("offers nothing for a research question, however the answer's sources are worded", () => {
    expect(proposalToolsFor("Summarize the last 10-Q for AXP: revenue, margins, and guidance")).toEqual([]);
    expect(proposalToolsFor("What drove this period's performance versus the S&P 500?")).toEqual([]);
    expect(proposalToolsFor("write my movement update for me")).toEqual([]);
  });
});

describe("cleanNoteBody", () => {
  it("trims and bounds a note", () => {
    expect(cleanNoteBody("  Guided to 8% growth.  \r\n")).toEqual({ body: "Guided to 8% growth." });
    expect(cleanNoteBody("   ")).toHaveProperty("error");
    expect(cleanNoteBody("x".repeat(NOTE_MAX + 1))).toHaveProperty("error");
  });
});

describe("matchNudges", () => {
  const nudges = [
    { id: "movement:m1:due", title: "Your team's SYK write-up is due in 5h" },
    { id: "earnings:e1:expectations", title: "Write down expectations for AXP" },
    { id: "changelog:170", title: "New in the app" },
  ];
  it("finds a nudge by id or by the member's words", () => {
    expect(matchNudges("changelog:170", nudges).map((n) => n.id)).toEqual(["changelog:170"]);
    expect(matchNudges("the SYK reminder", nudges).map((n) => n.id)).toEqual(["movement:m1:due"]);
    expect(matchNudges("AXP expectations", nudges).map((n) => n.id)).toEqual(["earnings:e1:expectations"]);
  });
  it("finds nothing rather than guessing", () => {
    expect(matchNudges("META", nudges)).toEqual([]);
    expect(matchNudges("the reminder", nudges)).toEqual([]);
  });
});
