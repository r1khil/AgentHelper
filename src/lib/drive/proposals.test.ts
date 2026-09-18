import { describe, expect, it } from "vitest";
import { proposalEligibility, type ProposalInput } from "./proposals";

const t1 = new Date("2025-01-01T00:00:00Z");
const t2 = new Date("2025-02-01T00:00:00Z");
const thesis = "Margins expand as the mix shifts toward fee revenue and the buyback continues at pace.";

function input(over: Partial<ProposalInput> = {}): ProposalInput {
  return { holdingThesis: null, fileKind: "initiating_coverage", summaryThesis: thesis, fileId: "f1", fileModifiedTime: t1, existing: [], ...over };
}

describe("proposalEligibility", () => {
  it("creates for a blank thesis and an initiating report", () => {
    expect(proposalEligibility(input()).action).toBe("create");
  });

  it("does nothing for other document kinds", () => {
    expect(proposalEligibility(input({ fileKind: "earnings_update" })).action).toBe("none");
    expect(proposalEligibility(input({ fileKind: null })).action).toBe("none");
  });

  it("does nothing when the holding already has a thesis", () => {
    expect(proposalEligibility(input({ holdingThesis: "We like it." })).action).toBe("none");
    expect(proposalEligibility(input({ holdingThesis: "   " })).action).toBe("create");
  });

  it("does nothing when the extracted thesis is missing or too short", () => {
    expect(proposalEligibility(input({ summaryThesis: null })).action).toBe("none");
    expect(proposalEligibility(input({ summaryThesis: "Buy." })).action).toBe("none");
  });

  it("does nothing when this exact file version was dismissed, but proposes a revised version", () => {
    const dismissed = { id: "p1", status: "dismissed" as const, sourceFileId: "f1", sourceModifiedTime: t1, proposed: thesis };
    expect(proposalEligibility(input({ existing: [dismissed] })).action).toBe("none");
    expect(proposalEligibility(input({ existing: [dismissed], fileModifiedTime: t2 })).action).toBe("create");
    expect(proposalEligibility(input({ existing: [dismissed], fileId: "f2" })).action).toBe("create");
  });

  it("updates a pending proposal whose text differs, leaves an identical one alone", () => {
    const pending = { id: "p2", status: "pending" as const, sourceFileId: "f1", sourceModifiedTime: t1, proposed: thesis };
    expect(proposalEligibility(input({ existing: [pending] })).action).toBe("none");
    const d = proposalEligibility(input({ existing: [pending], summaryThesis: `${thesis} Revised.` }));
    expect(d.action).toBe("update");
    expect(d.pendingId).toBe("p2");
  });
});
