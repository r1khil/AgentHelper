import { describe, expect, it } from "vitest";
import { pickTeamRecipients, type TeamPerson } from "./recipients-rule";

const p = (id: string, role: TeamPerson["role"]): TeamPerson => ({ id, email: `${id}@example.edu`, role });

describe("pickTeamRecipients", () => {
  it("sends to the team's leads only when it has any", () => {
    const team = [p("ann", "associate_analyst"), p("lee", "lead_analyst"), p("bo", "associate_analyst"), p("liz", "lead_analyst")];
    expect(pickTeamRecipients(team)).toEqual([
      { id: "lee", email: "lee@example.edu" },
      { id: "liz", email: "liz@example.edu" },
    ]);
  });

  it("falls back to every member when the team has no lead", () => {
    const team = [p("ann", "associate_analyst"), p("ed", "exec")];
    expect(pickTeamRecipients(team).map((r) => r.id)).toEqual(["ann", "ed"]);
  });

  it("returns no one for an empty team, and never the same person twice", () => {
    expect(pickTeamRecipients([])).toEqual([]);
    expect(pickTeamRecipients([p("lee", "lead_analyst"), p("lee", "lead_analyst")])).toHaveLength(1);
  });
});
