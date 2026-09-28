import { describe, expect, it } from "vitest";
import type { DriveChange } from "./changes";
import { applyChanges, type IndexedRow } from "./changes-diff";
import { FOLDER_MIME, SHORTCUT_MIME } from "./tree";

const ROOT = "root";
const now = new Date("2025-03-01T00:00:00Z");
const holdings = [{ id: "h-axp", ticker: "AXP", companyName: "American Express", teamId: "t-fin" }];
const teams = [{ id: "t-fin", name: "Financials" }];

function row(over: Partial<IndexedRow> & { id: string; path: string }): IndexedRow {
  return { name: over.path.split("/").pop()!, parentId: null, isFolder: false, holdingId: null, ticker: null, kind: null, createdByApp: false, uploadedBy: null, ...over };
}

const existing = () =>
  new Map<string, IndexedRow>([
    ["f-fin", row({ id: "f-fin", path: "Financials", parentId: ROOT, isFolder: true })],
    ["f-axp", row({ id: "f-axp", path: "Financials/American Express (AXP)", parentId: "f-fin", isFolder: true, holdingId: "h-axp", ticker: "AXP" })],
    ["doc1", row({ id: "doc1", path: "Financials/American Express (AXP)/AXP IC.pdf", parentId: "f-axp", holdingId: "h-axp", ticker: "AXP", kind: "initiating_coverage" })],
    ["app1", row({ id: "app1", path: "Financials/American Express (AXP)/AXP Model (app).xlsx", parentId: "f-axp", holdingId: "h-axp", ticker: "AXP", kind: "model", createdByApp: true, uploadedBy: "u1" })],
  ]);

const change = (file: Partial<DriveChange["file"]> & { id: string; name: string }, extra: Partial<DriveChange> = {}): DriveChange => ({
  fileId: file.id,
  file: { mimeType: "application/pdf", modifiedTime: "2025-03-01T00:00:00Z", ...file } as DriveChange["file"],
  ...extra,
});

describe("applyChanges", () => {
  it("indexes a new file under a company folder with the inherited holding and an inferred kind", () => {
    const plan = applyChanges({ rootId: ROOT, changes: [change({ id: "doc2", name: "AXP Q4 Earnings Update.docx", parents: ["f-axp"], size: "1234" })], existing: existing(), holdings, teams, now });
    expect(plan.needsFullSync).toBe(false);
    expect(plan.deletes).toEqual([]);
    expect(plan.upserts).toHaveLength(1);
    expect(plan.upserts[0]).toMatchObject({ id: "doc2", path: "Financials/American Express (AXP)/AXP Q4 Earnings Update.docx", holdingId: "h-axp", ticker: "AXP", kind: "earnings_update", size: 1234, parentId: "f-axp" });
  });

  it("deletes a trashed or removed file, and flags a removed folder", () => {
    const plan = applyChanges({ rootId: ROOT, changes: [change({ id: "doc1", name: "AXP IC.pdf", parents: ["f-axp"], trashed: true }), { fileId: "f-axp", removed: true }], existing: existing(), holdings, teams, now });
    expect(plan.deletes).toEqual(["doc1", "f-axp"]);
    expect(plan.needsFullSync).toBe(true);
    expect(plan.reasons[0]).toMatch(/folder removed/);
  });

  it("ignores changes outside the root and shortcuts", () => {
    const plan = applyChanges({ rootId: ROOT, changes: [change({ id: "x", name: "Personal.pdf", parents: ["elsewhere"] }), change({ id: "s", name: "Link", parents: ["f-axp"], mimeType: SHORTCUT_MIME })], existing: existing(), holdings, teams, now });
    expect(plan.upserts).toEqual([]);
    expect(plan.deletes).toEqual([]);
    expect(plan.needsFullSync).toBe(false);
  });

  it("resolves a new company folder and its files in the same batch, folders first", () => {
    const changes = [change({ id: "n1", name: "Visa IC.pdf", parents: ["f-v"] }), change({ id: "f-v", name: "Visa (V)", parents: ["f-fin"], mimeType: FOLDER_MIME })];
    const hs = [...holdings, { id: "h-v", ticker: "V", companyName: "Visa", teamId: "t-fin" }];
    const plan = applyChanges({ rootId: ROOT, changes, existing: existing(), holdings: hs, teams, now });
    expect(plan.upserts.map((u) => u.id)).toEqual(["f-v", "n1"]);
    expect(plan.upserts[0]).toMatchObject({ isFolder: true, holdingId: "h-v", ticker: "V", kind: null, path: "Financials/Visa (V)" });
    expect(plan.upserts[1]).toMatchObject({ holdingId: "h-v", ticker: "V", kind: "initiating_coverage", path: "Financials/Visa (V)/Visa IC.pdf" });
  });

  it("keeps the ticker for an unmatched company folder and a depth-1 team folder matches no holding", () => {
    const plan = applyChanges({ rootId: ROOT, changes: [change({ id: "f-x", name: "Acme (ACME)", parents: ["f-fin"], mimeType: FOLDER_MIME }), change({ id: "f-e", name: "Energy", parents: [ROOT], mimeType: FOLDER_MIME })], existing: existing(), holdings, teams, now });
    expect(plan.upserts.find((u) => u.id === "f-x")).toMatchObject({ holdingId: null, ticker: "ACME" });
    expect(plan.upserts.find((u) => u.id === "f-e")).toMatchObject({ holdingId: null, ticker: null, path: "Energy" });
  });

  it("flags a move or folder rename for a full crawl", () => {
    const moved = applyChanges({ rootId: ROOT, changes: [change({ id: "doc1", name: "AXP IC.pdf", parents: ["f-fin"] })], existing: existing(), holdings, teams, now });
    expect(moved.needsFullSync).toBe(true);
    expect(moved.upserts[0]).toMatchObject({ path: "Financials/AXP IC.pdf", holdingId: null });
    const renamed = applyChanges({ rootId: ROOT, changes: [change({ id: "f-axp", name: "AmEx (AXP)", parents: ["f-fin"], mimeType: FOLDER_MIME })], existing: existing(), holdings, teams, now });
    expect(renamed.needsFullSync).toBe(true);
    expect(renamed.reasons[0]).toMatch(/renamed/);
  });

  it("deletes a row that moved out of the root", () => {
    const plan = applyChanges({ rootId: ROOT, changes: [change({ id: "doc1", name: "AXP IC.pdf", parents: ["somewhere-else"] })], existing: existing(), holdings, teams, now });
    expect(plan.deletes).toEqual(["doc1"]);
    expect(plan.needsFullSync).toBe(true);
  });

  it("files a new document by the other holding's ticker in its name, as the full crawl does", () => {
    const withMeta = [...holdings, { id: "h-meta", ticker: "META", companyName: "Meta Platforms, Inc.", teamId: "t-fin" }];
    const plan = applyChanges({
      rootId: ROOT,
      changes: [
        change({ id: "misfiled", name: "Meta Platforms, Inc. (META)_Valuation Workbook.xlsx", parents: ["f-axp"] }),
        change({ id: "subdir", name: "Meta Platforms, Inc. (META)", parents: ["f-axp"], mimeType: FOLDER_MIME }),
        change({ id: "inner", name: "notes.pdf", parents: ["subdir"] }),
        change({ id: "peer", name: "AXP vs Visa (V) comps.xlsx", parents: ["f-axp"] }),
      ],
      existing: existing(),
      holdings: withMeta,
      teams,
      now,
    });
    const by = Object.fromEntries(plan.upserts.map((u) => [u.id, u]));
    expect(by.misfiled).toMatchObject({ holdingId: "h-meta", ticker: "META" });
    expect(by.subdir).toMatchObject({ holdingId: "h-meta", ticker: "META" });
    expect(by.inner).toMatchObject({ holdingId: "h-meta", ticker: "META" });
    expect(by.peer).toMatchObject({ holdingId: "h-axp", ticker: "AXP" });
  });

  it("keeps an app-created file's holding, kind, and uploader", () => {
    const plan = applyChanges({ rootId: ROOT, changes: [change({ id: "app1", name: "AXP Model (app).xlsx", parents: ["f-axp"], mimeType: "application/octet-stream" })], existing: existing(), holdings, teams, now });
    expect(plan.upserts[0]).toMatchObject({ createdByApp: true, uploadedBy: "u1", kind: "model", holdingId: "h-axp" });
  });
});
