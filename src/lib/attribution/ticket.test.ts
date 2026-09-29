import { describe, expect, it } from "vitest";
import { parseLedgerCsv } from "./csv";
import { beforeOpening, markRepeats, parseTicket, recordable, ticketFileHints, ticketsInText, ticketsToCsv } from "./ticket";

// mammoth's raw text for the real Fall 2026 SYK ticket; the account number sits in the page header and never reaches the text.
const SYK =
  "_____________________________________________________________________________________\n\nAction (Buy, Sell): \t   \tBuy\n\nEquity (Name, Ticker):            Stryker Corp (SYK)\n\nDate: \t\t\t\t9/18/2026\t \n\nPrice:\t    \t    \t\t$280.13\n\nTime:\t\t    \t   \t9:30 AM\n\nNumber of Shares:\t    \t83\n\nMarket Value:\t                \t$23,250.79\n\nPercent of Portfolio:\t    \t0.50%\n\nSemester:\t\t   \tFall 2026\n\nSector:\t\t\t   \tHealthcare\n\nChief Investment Officer\n\nName:\t\t\t       \tAadi Patil\n\nSignature:\t\t    ______________________________          \tDate: September 15, 2026\n\nPortfolio Manager \n\nName:\t\t\t     \tSaad Quddus\n\nSignature:\t\t    ______________________________          \tDate: September 15, 2026\n\n";
const SYK_FILE = "Stryker Corp (SYK)_Trade Ticket (18-Sep-2026).docx";

const ticket = (over: Record<string, string>) =>
  Object.entries({ "Action (Buy, Sell)": "Sell", "Equity (Name, Ticker)": "State Street Consumer Staples Sel Sect SPDR ETF (XLP)", Date: "9/22/2026", Price: "$82.65", Time: "12:30 PM", "Number of Shares": "2,246", "Market Value": "$185,631.90", ...over })
    .map(([k, v]) => `${k}:\t${v}`)
    .join("\n\n");

describe("ticketsInText", () => {
  it("finds each pasted ticket, starting at its Action line", () => {
    const found = ticketsInText(`Can you record these?\n\n${SYK}\n\n${ticket({})}`);
    expect(found).toHaveLength(2);
    expect(found.map((t) => parseTicket(t, "pasted").ticket?.ticker)).toEqual(["SYK", "XLP"]);
    // The first ticket's sign-off dates stay with it and never become the second one's trade date.
    expect(parseTicket(found[1], "pasted").ticket?.date).toBe("2026-09-22");
  });
  it("reads a forwarded ticket and ignores text that only mentions an action", () => {
    expect(ticketsInText("> Action (Buy, Sell): Buy\n> Equity: Stryker Corp (SYK)\n> Price: $280.13")).toHaveLength(1);
    expect(ticketsInText("Action: follow up with IR about guidance")).toEqual([]);
    expect(ticketsInText("record the SYK trade")).toEqual([]);
  });
});

describe("parseTicket", () => {
  it("reads the real ticket, ignoring the sign-off dates", () => {
    const r = parseTicket(SYK, SYK_FILE);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ticket).toEqual({
      side: "buy", name: "Stryker Corp", ticker: "SYK", date: "2026-09-18", time: "9:30 AM", shares: 83, price: 280.13,
      marketValue: 23250.79, percentOfPortfolio: 0.5, semester: "Fall 2026", sector: "Healthcare",
    });
  });

  it("reads thousands separators and long fund names", () => {
    const r = parseTicket(ticket({}), "x.docx");
    expect(r.ticket).toMatchObject({ side: "sell", ticker: "XLP", shares: 2246, price: 82.65 });
  });

  it("flags a market value that does not match shares × price", () => {
    // The real Fall 2026 XLP ticket: 2,246 × $82.65 is $185,631.90, but it prints $185,811.58.
    const r = parseTicket(ticket({ "Market Value": "$185,811.58" }), "x.docx");
    expect(r.ticket).not.toBeNull();
    expect(r.warnings[0]).toMatch(/185,631.90.*185,811.58/);
  });

  it("flags a file name that disagrees with the ticket", () => {
    const r = parseTicket(ticket({}), "iShares (IYK)_Trade Ticket (21-Sep-2026).docx");
    expect(r.warnings).toEqual(["The file name says IYK, the ticket says XLP.", "The file name says 2026-09-21, the ticket says 2026-09-22."]);
  });

  it("rejects missing or unreadable fields with a message per field", () => {
    const r = parseTicket(ticket({ "Action (Buy, Sell)": "Hold", "Equity (Name, Ticker)": "Some Fund", Price: "" }), "x.docx");
    expect(r.ticket).toBeNull();
    expect(r.errors).toHaveLength(3);
  });

  it("rejects a document that is not a ticket", () => {
    const r = parseTicket("Quarterly letter\n\nDear investors:", "letter.docx");
    expect(r.ticket).toBeNull();
    expect(r.errors[0]).toMatch(/does not look like a trade ticket/);
  });
});

describe("ticketFileHints", () => {
  it("reads ticker and date from the naming convention", () => {
    expect(ticketFileHints(SYK_FILE)).toEqual({ ticker: "SYK", date: "2026-09-18" });
    expect(ticketFileHints("notes.docx")).toEqual({ ticker: null, date: null });
  });
});

describe("markRepeats and ticketsToCsv", () => {
  it("records a ticket uploaded twice once, and produces an importable CSV", () => {
    const reads = markRepeats([parseTicket(SYK, SYK_FILE), parseTicket(SYK, "copy.docx"), parseTicket(ticket({}), "xlp.docx")]);
    expect(reads[1].skip).toContain(SYK_FILE);

    const csv = ticketsToCsv(recordable(reads));
    const parsed = parseLedgerCsv(csv, { today: "2026-09-22", isTradingDay: () => true });
    expect(parsed.errors).toEqual([]);
    expect(parsed.trades.map((t) => [t.date, t.side, t.ticker, t.shares, t.price, t.note])).toEqual([
      ["2026-09-18", "buy", "SYK", 83, 280.13, "Trade ticket · 9:30 AM · Fall 2026 · Healthcare"],
      ["2026-09-22", "sell", "XLP", 2246, 82.65, "Trade ticket · 12:30 PM"],
    ]);
  });
});

describe("beforeOpening", () => {
  it("skips tickets dated before the opening holdings, which already count them", () => {
    expect(beforeOpening("2026-09-15", "2026-09-17")).toBe("Dated 2026-09-15, before the ledger's opening holdings on 2026-09-17, which already include it.");
  });

  it("keeps tickets on or after the opening date, or when there are no opening holdings", () => {
    expect(beforeOpening("2026-09-17", "2026-09-17")).toBeNull();
    expect(beforeOpening("2026-09-18", "2026-09-17")).toBeNull();
    expect(beforeOpening("2026-09-15", null)).toBeNull();
  });
});
