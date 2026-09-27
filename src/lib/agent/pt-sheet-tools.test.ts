import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const calls: string[] = [];
vi.mock("@/lib/chats", () => ({
  markChatFundOnly: vi.fn(async (id: string) => {
    calls.push(`mark:${id}`);
  }),
}));
vi.mock("@/lib/pt-sheet/read", () => ({ ptSheetConfigured: vi.fn(() => true), readPtSheet: vi.fn() }));

import { markChatFundOnly } from "@/lib/chats";
import { ptSheetConfigured, readPtSheet } from "@/lib/pt-sheet/read";
import type { PtSheet } from "@/lib/pt-sheet/read";
import { makePtSheetTools, ptSheetToolAllowed } from "./pt-sheet-tools";

const sheet: PtSheet = {
  fileId: "FILE",
  name: "Owl Fund Price Targets",
  url: "https://docs.google.com/spreadsheets/d/FILE/edit",
  modifiedTime: "2026-09-26T12:26:35.309Z",
  lastModifiedBy: "Aadi Patil",
  fetchedAt: "2026-09-27T03:00:00.000Z",
  missingTabs: [],
  tabs: [
    {
      name: "Price Targets",
      about: "Targets.",
      status: "ok",
      missingLabels: [],
      columns: [
        { col: "B", label: "Ticker" },
        { col: "E", label: "Target Price" },
      ],
      rows: [
        { row: 4, cells: [{ ref: "B4", col: "B", label: "Ticker", v: "XLY" }] },
        { row: 5, cells: [{ ref: "B5", col: "B", label: "Ticker", v: "AMZN" }, { ref: "E5", col: "E", label: "Target Price", v: 271, text: "$271.00" }] },
      ],
      errorCells: 0,
      truncated: false,
      gid: 42,
    },
  ],
};

const run = async (input: { tabs: string[]; ticker?: string }, state = { read: false }) => {
  const t = makePtSheetTools({ chatId: "chat-1", state }).read_pt_sheet;
  return (await t.execute!(input as never, { toolCallId: "1", messages: [] } as never)) as { data: { tabs: { text: string; sourceId: string }[] } | null; sources: { id: string; url?: string; sourceType?: string }[]; error?: string };
};

beforeEach(() => {
  calls.length = 0;
  vi.mocked(readPtSheet).mockImplementation(async () => {
    calls.push("read");
    return sheet;
  });
  vi.mocked(markChatFundOnly).mockImplementation(async (id: string) => {
    calls.push(`mark:${id}`);
  });
});

describe("ptSheetToolAllowed", () => {
  const viewer = (role: string) => ({ role }) as never;
  it("is for execs and admins in a saved chat only", () => {
    expect(ptSheetToolAllowed({ viewer: viewer("exec"), chatId: "c" })).toBe(true);
    expect(ptSheetToolAllowed({ viewer: viewer("admin"), chatId: "c" })).toBe(true);
    expect(ptSheetToolAllowed({ viewer: viewer("associate_analyst"), chatId: "c" })).toBe(false);
    expect(ptSheetToolAllowed({ viewer: viewer("lead_analyst"), chatId: "c" })).toBe(false);
    expect(ptSheetToolAllowed({ viewer: null, chatId: "c" })).toBe(false);
    expect(ptSheetToolAllowed({ viewer: viewer("exec"), chatId: null })).toBe(false);
    expect(ptSheetToolAllowed({ viewer: viewer("exec"), chatId: "c", purpose: "prep" })).toBe(false);
  });

  it("is off when Drive isn't configured", () => {
    vi.mocked(ptSheetConfigured).mockReturnValueOnce(false);
    expect(ptSheetToolAllowed({ viewer: { role: "admin" } as never, chatId: "c" })).toBe(false);
  });
});

describe("read_pt_sheet", () => {
  it("makes the chat fund-only and pins the model before reading", async () => {
    const state = { read: false };
    const r = await run({ tabs: ["Price Targets"] }, state);
    expect(calls).toEqual(["mark:chat-1", "read"]);
    expect(state.read).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it("reads nothing if the chat cannot be restricted", async () => {
    vi.mocked(markChatFundOnly).mockRejectedValueOnce(new Error("db down"));
    const state = { read: false };
    const r = await run({ tabs: ["Price Targets"] }, state);
    expect(calls).not.toContain("read");
    expect(state.read).toBe(false);
    expect(r.error).toMatch(/db down/);
  });

  it("returns only the ticker's rows, with a citable source per tab linking to that tab", async () => {
    const r = await run({ tabs: ["Price Targets"], ticker: "amzn" });
    const text = r.data!.tabs[0].text;
    expect(text).toContain("r5: B=AMZN | E=$271.00");
    expect(text).not.toContain("XLY");
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0]).toMatchObject({ sourceType: "PT sheet", url: "https://docs.google.com/spreadsheets/d/FILE/edit#gid=42" });
    expect(r.sources[0].id).toMatch(/^ptsheet-/);
    expect(r.data!.tabs[0].sourceId).toBe(r.sources[0].id);
  });

  it("only offers the allowlisted tabs", () => {
    const schema = makePtSheetTools({ chatId: "c", state: { read: false } }).read_pt_sheet.inputSchema as unknown as { safeParse: (v: unknown) => { success: boolean } };
    expect(schema.safeParse({ tabs: ["Price Targets"] }).success).toBe(true);
    expect(schema.safeParse({ tabs: ["Credit Spreads"] }).success).toBe(false);
    expect(schema.safeParse({ tabs: ["Sells/Unbought Pitches"] }).success).toBe(false);
  });
});
