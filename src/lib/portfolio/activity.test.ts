import { describe, expect, it } from "vitest";
import { buildActivity, summarizeActivity, type FlowIn, type TradeIn } from "./activity";

const trade = (o: Partial<TradeIn> & Pick<TradeIn, "id" | "date" | "ticker">): TradeIn => ({ side: "buy", kind: "trade", shares: 10, price: 100, fees: 0, note: null, voided: false, createdAt: `${o.date}T15:00:00Z`, by: "Rikhil Sharma", ...o });
const flow = (o: Partial<FlowIn> & Pick<FlowIn, "id" | "date">): FlowIn => ({ kind: "deposit", amount: 1000, note: null, voided: false, createdAt: `${o.date}T15:00:00Z`, by: "Rikhil Sharma", ...o });

const rows = {
  trades: [
    trade({ id: "o1", date: "2026-09-17", ticker: "MSFT", kind: "opening", shares: 100, price: 500 }),
    trade({ id: "o2", date: "2026-09-17", ticker: "XLP", kind: "opening", shares: 200, price: 80 }),
    trade({ id: "t1", date: "2026-09-18", ticker: "KRE", side: "sell", shares: 849, price: 71.5, note: "Trade ticket · 9:32 AM" }),
    trade({ id: "t2", date: "2026-09-21", ticker: "AVGO", shares: 25, price: 318.4, note: "a duplicate" }),
    trade({ id: "t3", date: "2026-09-22", ticker: "AVGO", shares: 25, price: 318.4, voided: true }),
  ],
  flows: [
    flow({ id: "f0", date: "2026-09-17", amount: 10_000, note: "Opening balance" }),
    flow({ id: "f1", date: "2026-09-18", amount: 25_000 }),
    flow({ id: "f2", date: "2026-09-19", kind: "fee", amount: 12 }),
  ],
  dividends: [{ date: "2026-09-21", ticker: "XLP", shares: 6.21, price: 80.02 }],
};

describe("buildActivity", () => {
  const days = buildActivity(rows);

  it("groups by day, newest first", () => {
    expect(days.map((d) => d.date)).toEqual(["2026-09-22", "2026-09-21", "2026-09-19", "2026-09-18", "2026-09-17"]);
  });

  it("writes a trade as the app words it, buys in parentheses and sells with a plus, and names its source", () => {
    const sell = days[3].entries.find((e) => e.title.startsWith("Sold"))!;
    expect(sell).toMatchObject({ letter: "S", title: "Sold 849 KRE at 71.50", amount: "+60,703.50", tone: "up" });
    expect(sell.meta).toBe("Trade ticket (.docx) · Rikhil Sharma");
    const buy = days[1].entries.find((e) => e.title.startsWith("Bought"))!;
    expect(buy).toMatchObject({ letter: "B", amount: "(7,960.00)", tone: "down" });
    expect(buy.meta).toBe("Manual · Rikhil Sharma · a duplicate");
  });

  it("keeps a voided entry, marked, with no way to void it again", () => {
    const voided = days[0].entries[0];
    expect(voided).toMatchObject({ voided: true, voidable: null });
  });

  it("turns the opening rows into one entry whose lines each carry their own void", () => {
    const opening = days[4].entries[0];
    expect(opening.title).toBe("Ledger opened · 2 holdings and cash");
    // 100 × 500 + 200 × 80 + 10,000 of opening cash.
    expect(opening.amount).toBe("76,000.00");
    expect(opening.lines).toHaveLength(3);
    expect(opening.lines!.filter((l) => l.voidable).map((l) => l.voidable!.table)).toEqual(["trade", "trade", "cash"]);
    // The opening balance is not also a cash entry.
    expect(days[4].entries).toHaveLength(1);
  });

  it("lists the reinvested dividend after that day's trades, as automatic", () => {
    expect(days[1].entries.map((e) => e.letter)).toEqual(["B", "D"]);
    expect(days[1].entries[1]).toMatchObject({ title: "Dividend reinvested · XLP", amount: "Reinvested", voidable: null });
  });

  it("words cash movements by whether they count as performance", () => {
    expect(days[3].entries.find((e) => e.type === "cash")!.meta).toContain("not counted as performance");
    expect(days[2].entries[0]).toMatchObject({ title: "Account fee", amount: "(12.00)", tone: "down" });
    expect(days[2].entries[0].meta).toContain("counts as performance");
  });
});

describe("summarizeActivity", () => {
  it("totals the recorded trades and net deposits, leaving out voided rows and the opening", () => {
    const s = summarizeActivity(rows, "2026-09-17");
    expect(s).toMatchObject({ since: "2026-09-17", trades: 2, deposits: 25_000, dividends: 1 });
    expect(s.bought).toBeCloseTo(7960, 6);
    expect(s.sold).toBeCloseTo(60_703.5, 6);
  });
});
