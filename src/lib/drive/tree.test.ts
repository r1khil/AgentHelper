import { describe, expect, it } from "vitest";
import { FOLDER_MIME, buildPaths, classifyTree, inferKind, matchHolding, matchTeam, namedHoldingOverride, namedTickers, parenthesizedTicker, type DriveItem, type HoldingRef, type TeamRef } from "./tree";

const ROOT = "root";
const folder = (id: string, name: string, parent: string): DriveItem => ({ id, name, mimeType: FOLDER_MIME, parents: [parent] });
const file = (id: string, name: string, parent: string, mimeType = "application/pdf"): DriveItem => ({ id, name, mimeType, parents: [parent] });

const teams: TeamRef[] = [
  { id: "t-fig", name: "FIG" },
  { id: "t-tech", name: "Information Technology" },
  { id: "t-ind", name: "Industrials" },
  { id: "t-cc", name: "Consumer & Communication Services" },
];
const holdings: HoldingRef[] = [
  { id: "h-axp", ticker: "AXP", companyName: "American Express Company", teamId: "t-fig" },
  { id: "h-nvda", ticker: "NVDA", companyName: "NVIDIA Corporation", teamId: "t-tech" },
  { id: "h-f", ticker: "F", companyName: "Ford Motor Company", teamId: "t-ind" },
  { id: "h-dup-a", ticker: "DUP", companyName: "Dup Co", teamId: "t-fig" },
  { id: "h-dup-b", ticker: "DUP", companyName: "Dup Co", teamId: "t-tech" },
];

describe("buildPaths", () => {
  it("builds relative paths and depth, dropping items outside the root", () => {
    const items: DriveItem[] = [
      folder("s1", "FIG", ROOT),
      folder("c1", "American Express (AXP)", "s1"),
      file("f1", "AXP Initiating Coverage.pdf", "c1"),
      file("stray", "elsewhere.pdf", "nowhere"),
      file("orphan", "orphan.pdf", "missing-parent"),
    ];
    const out = buildPaths(ROOT, items);
    expect(out.map((o) => o.path)).toEqual(["FIG", "FIG/American Express (AXP)", "FIG/American Express (AXP)/AXP Initiating Coverage.pdf"]);
    expect(out.find((o) => o.id === "f1")).toMatchObject({ depth: 3, ancestors: ["s1", "c1"], parentId: "c1", isFolder: false });
    expect(out.find((o) => o.id === "s1")).toMatchObject({ depth: 1, ancestors: [], isFolder: true });
  });
});

describe("matchTeam", () => {
  it("matches sector folders loosely", () => {
    expect(matchTeam("FIG", teams)?.id).toBe("t-fig");
    expect(matchTeam("Information Technology (Tech)", teams)?.id).toBe("t-tech");
    expect(matchTeam("6. Information Technology Coverage", teams)?.id).toBe("t-tech");
    expect(matchTeam("Random", teams)).toBeNull();
    expect(matchTeam("1. Consumer & Communications Coverage", teams)?.id).toBe("t-cc");
  });
});

describe("matchHolding", () => {
  it("uses the parenthesized ticker first", () => {
    expect(parenthesizedTicker("American Express (AXP)")).toBe("AXP");
    expect(matchHolding("American Express (axp)", holdings)?.id).toBe("h-axp");
    expect(matchHolding("Amex (AXP) 2026", holdings)?.id).toBe("h-axp");
  });
  it("treats one- and two-letter tickers case-sensitively", () => {
    expect(matchHolding("Ford (F)", holdings)?.id).toBe("h-f");
    expect(matchHolding("Ford (f)", holdings)?.id).toBe("h-f"); // falls through to the company-name match
    expect(matchHolding("Fun (f)", holdings)).toBeNull();
  });
  it("matches an all-caps token and falls back to the company name", () => {
    expect(matchHolding("NVDA", holdings)?.id).toBe("h-nvda");
    expect(matchHolding("Nvidia Corp", holdings)?.id).toBe("h-nvda");
    expect(matchHolding("Nvi", holdings)).toBeNull();
    expect(matchHolding("Apple Inc", holdings)).toBeNull();
  });
  it("prefers the sector's team for duplicate tickers and refuses to guess otherwise", () => {
    expect(matchHolding("Dup Co (DUP)", holdings)).toBeNull();
    expect(matchHolding("Dup Co (DUP)", holdings, "t-tech")?.id).toBe("h-dup-b");
  });
});

describe("inferKind", () => {
  it("classifies by mime type and name", () => {
    expect(inferKind("AXP Model.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("model");
    expect(inferKind("AXP Model", "application/vnd.google-apps.spreadsheet")).toBe("model");
    expect(inferKind("AXP Initiating Coverage.pdf", "application/pdf")).toBe("initiating_coverage");
    expect(inferKind("AXP Q2 2026 Earnings Update.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("earnings_update");
    expect(inferKind("notes.txt", "text/plain")).toBe("other");
  });
});

describe("classifyTree", () => {
  it("assigns team, ticker, holding, and kind down the tree and reports unmatched company folders", () => {
    const items: DriveItem[] = [
      folder("s1", "FIG", ROOT),
      folder("c1", "American Express (AXP)", "s1"),
      folder("c1sub", "Earnings updates", "c1"),
      file("f1", "AXP Initiating Coverage.pdf", "c1"),
      file("f2", "Q2 2026 update.docx", "c1sub", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      folder("c2", "Unknown Co (ZZZ)", "s1"),
      file("f3", "zzz.pdf", "c2"),
      folder("s2", "Loose", ROOT),
      folder("c3", "Dup Co (DUP)", "s2"),
      file("f4", "readme.txt", ROOT, "text/plain"),
      folder("sub", "1) Communication Services", "s1"),
      folder("cur", "Current Holdings", "sub"),
      folder("deep", "NVIDIA Corporation (NVDA)", "cur"),
      folder("deeper", "Earnings Updates", "deep"),
      folder("sem", "Fall 2025", "deeper"),
      file("f5", "Q3 FY2026 Earnings Update.pdf", "sem"),
      folder("old", "Old Holdings", "sub"),
      folder("oldco", "Comcast Corporation (CMCSA)", "old"),
      file("f6", "CMCSA pitch.pdf", "oldco"),
    ];
    const { items: out, unmatched } = classifyTree(ROOT, items, holdings, teams);
    const by = Object.fromEntries(out.map((o) => [o.id, o]));
    expect(by.s1).toMatchObject({ teamId: "t-fig", holdingId: null, ticker: null });
    expect(by.c1).toMatchObject({ teamId: "t-fig", holdingId: "h-axp", ticker: "AXP" });
    expect(by.f1).toMatchObject({ holdingId: "h-axp", ticker: "AXP", kind: "initiating_coverage" });
    expect(by.f2).toMatchObject({ holdingId: "h-axp", ticker: "AXP", kind: "earnings_update" });
    expect(by.c2).toMatchObject({ holdingId: null, ticker: "ZZZ" });
    expect(by.f3).toMatchObject({ holdingId: null, ticker: "ZZZ", kind: "other" });
    expect(by.c3).toMatchObject({ holdingId: null, ticker: "DUP" });
    expect(by.f4).toMatchObject({ teamId: null, holdingId: null, kind: "other" });
    expect(by.f5).toMatchObject({ teamId: "t-fig", holdingId: "h-nvda", ticker: "NVDA", kind: "earnings_update" });
    expect(by.cur).toMatchObject({ holdingId: null, ticker: null });
    expect(by.f6).toMatchObject({ holdingId: null, ticker: "CMCSA" });
    expect(unmatched).toEqual(["FIG/Unknown Co (ZZZ)", "Loose/Dup Co (DUP)"]);
  });
});

describe("namedTickers / namedHoldingOverride", () => {
  const cc: HoldingRef[] = [
    { id: "h-meta", ticker: "META", companyName: "Meta Platforms, Inc.", teamId: "t-cc" },
    { id: "h-amzn", ticker: "AMZN", companyName: "Amazon.com, Inc.", teamId: "t-cc" },
    ...holdings,
  ];

  it("reads only all-caps tickers in parentheses", () => {
    expect(namedTickers("Amazon.com, Inc. (AMZN)_Valuation Workbook (14-Oct-2025).xlsx")).toEqual(["AMZN"]);
    expect(namedTickers("AMZN Model (app).xlsx")).toEqual([]);
    expect(namedTickers("Deck (30-Mar-2022) (1).pdf")).toEqual([]);
    expect(namedTickers("Meta (META) vs Amazon (AMZN).pdf")).toEqual(["META", "AMZN"]);
  });

  it("moves a file naming another holding's ticker to that holding", () => {
    expect(namedHoldingOverride("Amazon.com, Inc. (AMZN)_Valuation Workbook (14-Oct-2025).xlsx", "META", cc)?.id).toBe("h-amzn");
  });

  it("keeps the folder's holding when the name also names it, names nothing, or names no holding", () => {
    expect(namedHoldingOverride("Meta Platforms, Inc. (META)_Valuation Workbook.xlsx", "META", cc)).toBeNull();
    expect(namedHoldingOverride("Meta (META) vs Amazon (AMZN) comps.xlsx", "META", cc)).toBeNull();
    expect(namedHoldingOverride("Q3 Earnings Update.pdf", "META", cc)).toBeNull();
    expect(namedHoldingOverride("Model (FINAL).xlsx", "META", cc)).toBeNull();
    expect(namedHoldingOverride("Snap Inc. (SNAP) comps.xlsx", "META", cc)).toBeNull();
  });

  it("does nothing outside a company folder, and refuses an ambiguous ticker unless the team settles it", () => {
    expect(namedHoldingOverride("Amazon.com, Inc. (AMZN) Pre-Pitch Memo.pdf", null, cc)).toBeNull();
    expect(namedHoldingOverride("Dup Co (DUP) model.xlsx", "META", cc)).toBeNull();
    expect(namedHoldingOverride("Dup Co (DUP) model.xlsx", "META", cc, "t-tech")?.id).toBe("h-dup-b");
  });
});

describe("classifyTree with a misfiled document", () => {
  it("files a document by the ticker in its own name when it contradicts the company folder", () => {
    const cc: HoldingRef[] = [
      { id: "h-meta", ticker: "META", companyName: "Meta Platforms, Inc.", teamId: "t-cc" },
      { id: "h-amzn", ticker: "AMZN", companyName: "Amazon.com, Inc.", teamId: "t-cc" },
    ];
    const xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const items: DriveItem[] = [
      folder("s", "1. Consumer & Communications Coverage", ROOT),
      folder("cur", "Current Holdings", "s"),
      folder("meta", "Meta Platforms, Inc. (META)", "cur"),
      folder("wm", "2) Working Model ", "meta"),
      file("own", "Meta Platforms, Inc. (META)_Valuation Workbook (03-Nov-2025).xlsx", "wm", xlsx),
      folder("oldm", "Old Models", "wm"),
      file("amzn", "Amazon.com, Inc. (AMZN)_Valuation Workbook (14-Oct-2025).xlsx", "oldm", xlsx),
      file("plain", "Old model v2.xlsx", "oldm", xlsx),
      folder("amznsub", "Amazon.com, Inc. (AMZN)", "oldm"),
      file("inner", "Cover notes.pdf", "amznsub"),
    ];
    const by = Object.fromEntries(classifyTree(ROOT, items, cc, teams).items.map((o) => [o.id, o]));
    expect(by.own).toMatchObject({ holdingId: "h-meta", ticker: "META" });
    expect(by.plain).toMatchObject({ holdingId: "h-meta", ticker: "META" });
    expect(by.amzn).toMatchObject({ holdingId: "h-amzn", ticker: "AMZN", kind: "model" });
    expect(by.amznsub).toMatchObject({ holdingId: "h-amzn", ticker: "AMZN" });
    expect(by.inner).toMatchObject({ holdingId: "h-amzn", ticker: "AMZN" });
  });
});
