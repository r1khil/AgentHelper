import { describe, expect, it } from "vitest";
import { MAX_MODEL_BYTES, parseStagedModelPath, stagedModelPath, validateModelFile } from "./upload";

const HOLDING = "6f1c2a3e-4b5d-4c6e-8f7a-9b0c1d2e3f4a";
const OTHER = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

describe("validateModelFile", () => {
  it("accepts xlsx and xlsm in any case and reports the extension", () => {
    expect(validateModelFile("Model.xlsx", 10)).toEqual({ ok: true, ext: "xlsx" });
    expect(validateModelFile("MODEL.XLSM", 10)).toEqual({ ok: true, ext: "xlsm" });
  });

  it("rejects other extensions, blank names, empty and oversized files", () => {
    expect(validateModelFile("model.xls", 10)).toEqual({ ok: false, error: "Only .xlsx or .xlsm files" });
    expect(validateModelFile("model.csv", 10).ok).toBe(false);
    expect(validateModelFile("", 10)).toEqual({ ok: false, error: "Choose an .xlsx file" });
    expect(validateModelFile("model.xlsx", 0)).toEqual({ ok: false, error: "The file is empty" });
    expect(validateModelFile("model.xlsx", MAX_MODEL_BYTES)).toEqual({ ok: true, ext: "xlsx" });
    expect(validateModelFile("model.xlsx", MAX_MODEL_BYTES + 1)).toEqual({ ok: false, error: "File is larger than 50MB" });
    expect(validateModelFile("model.xlsx", Number.NaN).ok).toBe(false);
  });
});

describe("staged paths", () => {
  it("round-trips its own output", () => {
    const p = stagedModelPath(HOLDING, "xlsm");
    expect(p.startsWith(`staging/${HOLDING}/`)).toBe(true);
    expect(parseStagedModelPath(p, HOLDING)).toEqual({ ext: "xlsm" });
    expect(parseStagedModelPath(p, HOLDING.toUpperCase())).toEqual({ ext: "xlsm" });
  });

  it("rejects another holding's staged file", () => {
    expect(parseStagedModelPath(stagedModelPath(OTHER, "xlsx"), HOLDING)).toBeNull();
  });

  it("rejects anything outside staging, including real model objects and traversal", () => {
    const uuid = "11111111-2222-4333-8444-555555555555";
    expect(parseStagedModelPath(`${HOLDING}/v1-1700000000000.xlsx`, HOLDING)).toBeNull();
    expect(parseStagedModelPath(`staging/${HOLDING}/../${HOLDING}/v1-1.xlsx`, HOLDING)).toBeNull();
    expect(parseStagedModelPath(`staging/${HOLDING}/${uuid}.xls`, HOLDING)).toBeNull();
    expect(parseStagedModelPath(`staging/${HOLDING}/${uuid}.xlsx/extra`, HOLDING)).toBeNull();
    expect(parseStagedModelPath(`/staging/${HOLDING}/${uuid}.xlsx`, HOLDING)).toBeNull();
    expect(parseStagedModelPath(`staging/${HOLDING}/notauuid.xlsx`, HOLDING)).toBeNull();
  });
});
