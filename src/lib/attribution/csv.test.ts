import { describe, expect, it } from "vitest";
import { IMPORT_TEMPLATE, parseDate, parseLedgerCsv, parseNumber, splitCsv, splitDuplicates } from "./csv";

const opts = { today: "2026-09-17", isTradingDay: (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay() % 6 !== 0 };

describe("splitCsv", () => {
  it("handles quotes, embedded commas and newlines, CRLF, BOM and blank lines", () => {
    expect(splitCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n\r\n"two\nlines",z')).toEqual([["a", "b"], ["x, y", 'he said "hi"'], ["two\nlines", "z"]]);
  });
});

describe("field parsing", () => {
  it("dates", () => {
    expect(parseDate("2025-1-5")).toBe("2025-01-05");
    expect(parseDate("3/31/2025")).toBe("2025-03-31");
    expect(parseDate("2025-02-30")).toBeNull();
    expect(parseDate("31/3/2025")).toBeNull();
  });
  it("numbers", () => {
    expect(parseNumber("$1,234.50")).toBe(1234.5);
    expect(parseNumber("")).toBeUndefined();
    expect(parseNumber("12abc")).toBeNaN();
  });
});

describe("parseLedgerCsv", () => {
  it("parses the template without errors", () => {
    const p = parseLedgerCsv(IMPORT_TEMPLATE, opts);
    expect(p.errors).toEqual([]);
    expect(p.trades.map((t) => [t.kind, t.side, t.ticker, t.needsPrice])).toEqual([["opening", "buy", "MSFT", true], ["trade", "buy", "NVDA", false], ["trade", "sell", "MSFT", false]]);
    expect(p.cashFlows.map((f) => [f.kind, f.amount])).toEqual([["deposit", 1500000], ["fee", 125]]);
    expect(p.trades[1]).toMatchObject({ line: 4, fees: 4.95, price: 131.25 });
  });

  it("accepts columns in any order and ignores extras", () => {
    const p = parseLedgerCsv("Type,Broker,Date,Amount\ndeposit,X,1/2/2025,\"1,000\"", opts);
    expect(p.errors).toEqual([]);
    expect(p.cashFlows[0]).toMatchObject({ date: "2025-01-02", amount: 1000 });
  });

  it("reports every bad row with its line number", () => {
    const p = parseLedgerCsv(
      ["date,type,ticker,shares,price,amount", "2025-01-04,buy,AAA,1,1,", "2027-01-04,buy,AAA,1,1,", "2025-01-06,swap,AAA,1,1,", "2025-01-06,buy,AAA,1,,", "2025-01-06,sell,AAA,-5,10,", "2025-01-06,deposit,,,,", "nope,buy,AAA,1,1,"].join("\n"),
      opts,
    );
    expect(p.errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(p.errors[0].message).toContain("not a trading day");
    expect(p.errors[3].message).toContain("Price is required");
    expect(p.trades).toHaveLength(0);
  });

  it("requires the header and enforces the row limit", () => {
    expect(parseLedgerCsv("2025-01-06,buy,AAA,1,1", opts).errors[0].message).toContain("Missing");
    expect(parseLedgerCsv("date,type\n2025-01-06,deposit\n2025-01-07,deposit", { ...opts, maxRows: 1 }).errors[0].message).toContain("limit");
    expect(parseLedgerCsv("", opts).errors[0].message).toContain("empty");
  });
});

describe("splitDuplicates", () => {
  it("skips rows already in the ledger, one for one", () => {
    const p = parseLedgerCsv("date,type,ticker,shares,price,amount\n2025-01-06,buy,AAA,10,5,\n2025-01-06,buy,AAA,10,5,\n2025-01-06,deposit,,,,100", opts);
    const r = splitDuplicates(p, {
      trades: [{ date: "2025-01-06", ticker: "AAA", side: "buy", shares: 10, price: 5, fees: 0 }],
      cashFlows: [{ date: "2025-01-06", kind: "deposit", amount: 100 }],
    });
    expect(r.duplicateLines).toEqual([2, 4]);
    expect(r.trades.map((t) => t.line)).toEqual([3]);
    expect(r.cashFlows).toHaveLength(0);
  });
});
