import { describe, expect, it } from "vitest";
import { canOpenChat } from "./roles";

describe("canOpenChat", () => {
  const analyst = { role: "associate_analyst" as const, teamId: "t1" };
  const lead = { role: "lead_analyst" as const, teamId: "t1" };
  const exec = { role: "exec" as const, teamId: null };

  it("opens team chats to the team and to execs", () => {
    const chat = { teamId: "t1", fundOnly: false };
    expect(canOpenChat(analyst, chat)).toBe(true);
    expect(canOpenChat(lead, chat)).toBe(true);
    expect(canOpenChat(exec, chat)).toBe(true);
    expect(canOpenChat({ role: "associate_analyst", teamId: "t2" }, chat)).toBe(false);
  });

  it("keeps fund-only chats (the PT sheet was read) to execs and admins", () => {
    const chat = { teamId: "t1", fundOnly: true };
    expect(canOpenChat(analyst, chat)).toBe(false);
    expect(canOpenChat(lead, chat)).toBe(false);
    expect(canOpenChat(exec, chat)).toBe(true);
    expect(canOpenChat({ role: "admin", teamId: null }, chat)).toBe(true);
  });

  it("keeps fund-wide chats (no team) to execs and admins", () => {
    const chat = { teamId: null, fundOnly: false };
    expect(canOpenChat(exec, chat)).toBe(true);
    expect(canOpenChat({ role: "admin", teamId: null }, chat)).toBe(true);
    expect(canOpenChat(analyst, chat)).toBe(false);
    expect(canOpenChat(lead, chat)).toBe(false);
    expect(canOpenChat({ role: "associate_analyst", teamId: null }, chat)).toBe(false);
  });
});
