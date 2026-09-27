import { describe, expect, it } from "vitest";
import { carriedFigureKeys, carryForward, deriveRelative, figuresComplete, normalizeFigures, parseFigureInput, withSheetFigures } from "./figures";
import type { WeeklyFigures } from "./types";

describe("parseFigureInput", () => {
  it("reads whatever the sheet is pasted as", () => {
    expect(parseFigureInput("4646.9")).toBe(4646.9);
    expect(parseFigureInput("$4,646.9k")).toBe(4646.9);
    expect(parseFigureInput("6.8%")).toBe(6.8);
    expect(parseFigureInput("(5.7%)")).toBe(-5.7);
    expect(parseFigureInput("-5.7")).toBe(-5.7);
    expect(parseFigureInput(" 12 ")).toBe(12);
  });

  it("treats blank as cleared and junk as unusable", () => {
    expect(parseFigureInput("")).toBe(null);
    expect(parseFigureInput(null)).toBe(null);
    expect(parseFigureInput("about six")).toBe(undefined);
    expect(parseFigureInput("1.2.3")).toBe(undefined);
  });
});

describe("deriveRelative", () => {
  it("is the fund's YTD less the benchmark's", () => {
    expect(deriveRelative(6.8, 12.5)).toBe(-5.7);
    expect(deriveRelative(12.5, 6.8)).toBe(5.7);
  });

  it("is unknown while either side is missing", () => {
    expect(deriveRelative(null, 12.5)).toBe(null);
    expect(deriveRelative(6.8, null)).toBe(null);
  });
});

const entered: WeeklyFigures = {
  aumK: { value: 4646.9, source: "entered" },
  ytdPct: { value: 6.8, source: "entered" },
  benchmarkYtdPct: { value: 12.5, source: "entered" },
};

describe("carryForward", () => {
  it("copies last week's numbers and flags them as carried", () => {
    expect(carryForward(entered)).toEqual({
      aumK: { value: 4646.9, source: "carried" },
      ytdPct: { value: 6.8, source: "carried" },
      benchmarkYtdPct: { value: 12.5, source: "carried" },
    });
  });

  it("carries nothing when there is no previous pack, or the value was blank", () => {
    expect(carryForward(null).aumK).toEqual({ value: null, source: "entered" });
    expect(carryForward({ ...entered, ytdPct: { value: null, source: "carried" } }).ytdPct).toEqual({ value: null, source: "entered" });
  });
});

describe("figuresComplete / carriedFigureKeys", () => {
  it("is complete only once an exec has saved every number", () => {
    expect(figuresComplete(entered)).toBe(true);
    expect(figuresComplete(carryForward(entered))).toBe(false);
    expect(figuresComplete({ ...entered, aumK: { value: null, source: "entered" } })).toBe(false);
  });

  it("names the figures still showing last week", () => {
    expect(carriedFigureKeys(carryForward(entered))).toEqual(["AUM", "YTD return", "SPXTR YTD"]);
    expect(carriedFigureKeys(entered)).toEqual([]);
  });
});

describe("normalizeFigures", () => {
  it("survives a row written before a field existed", () => {
    expect(normalizeFigures({})).toEqual({
      aumK: { value: null, source: "entered" },
      ytdPct: { value: null, source: "entered" },
      benchmarkYtdPct: { value: null, source: "entered" },
    });
    expect(normalizeFigures(null).aumK.value).toBe(null);
    expect(normalizeFigures({ aumK: { value: "4646.9", source: "carried" } }).aumK).toEqual({ value: null, source: "carried" });
    expect(normalizeFigures({ ytdPct: { value: 6.8, source: "carried" } }).ytdPct).toEqual({ value: 6.8, source: "carried" });
  });
});

describe("withSheetFigures", () => {
  const asOf = "2026-09-26T12:26:35.309Z";
  const sheet = { aumK: { value: 4674.21, ref: "D3" }, ytdPct: { value: 6.34, ref: "G6" }, benchmarkYtdPct: { value: 12.9, ref: "G8" } };
  const carried = { aumK: { value: 4646.9, source: "carried" as const }, ytdPct: { value: 6.8, source: "carried" as const }, benchmarkYtdPct: { value: null, source: "entered" as const } };

  it("replaces carried placeholders and blanks with the sheet's figures", () => {
    const f = withSheetFigures(carried, sheet, asOf);
    expect(f.aumK).toEqual({ value: 4674.21, source: "sheet", ref: "D3", asOf });
    expect(f.benchmarkYtdPct).toEqual({ value: 12.9, source: "sheet", ref: "G8", asOf });
    expect(figuresComplete(f)).toBe(true);
  });

  it("keeps an exec's own entry unless they asked for the sheet", () => {
    const typed = { ...carried, ytdPct: { value: 7.1, source: "entered" as const } };
    expect(withSheetFigures(typed, sheet, asOf).ytdPct).toEqual({ value: 7.1, source: "entered" });
    expect(withSheetFigures(typed, sheet, asOf, { force: true }).ytdPct.source).toBe("sheet");
  });

  it("leaves a figure alone when the sheet had none", () => {
    expect(withSheetFigures(carried, { ...sheet, ytdPct: null }, asOf).ytdPct).toEqual(carried.ytdPct);
  });

  it("survives a round trip through the stored blob", () => {
    const f = withSheetFigures(carried, sheet, asOf);
    expect(normalizeFigures(JSON.parse(JSON.stringify(f)))).toEqual(f);
  });
});
