import { describe, expect, it } from "vitest";
import { pastedTicketsSummary, proposedTrades, splitHeld } from "./pasted-tickets";
import type { TicketRead, TradeTicket } from "./ticket";

const t = (over: Partial<TradeTicket>): TradeTicket => ({
  side: "buy",
  name: "Stryker Corp",
  ticker: "SYK",
  date: "2026-09-18",
  time: null,
  shares: 83,
  price: 280.13,
  marketValue: null,
  percentOfPortfolio: null,
  semester: null,
  sector: null,
  ...over,
});
const read = (over: Partial<TicketRead>): TicketRead => ({ file: "Pasted ticket", ticket: t({}), errors: [], warnings: [], ...over });

describe("pasted tickets", () => {
  const reads = [
    read({ file: "Pasted ticket 1" }),
    read({ file: "Pasted ticket 2", ticket: t({ ticker: "AXP", name: "American Express" }), priceGap: 0.09, warnings: ["$300 is 9.0% above that day's close."] }),
    read({ file: "Pasted ticket 3", ticket: t({ ticker: "META", name: "Meta" }), skip: "Already in the ledger." }),
    read({ file: "Pasted ticket 4", ticket: null, errors: ["Price must be a number above zero."] }),
  ];
  const check = splitHeld(reads);

  it("records only readable, unskipped tickets priced near the close; holds the rest for the Ledger page", () => {
    expect(check.ready.map((x) => x.ticker)).toEqual(["SYK"]);
    expect(check.held.map((r) => r.ticket?.ticker)).toEqual(["AXP"]);
    expect(proposedTrades(check).map((l) => l.status)).toEqual(["record", "held", "skip", "unreadable"]);
    expect(proposedTrades(check)[0].line).toMatch(/^Bought 83 SYK \(Stryker Corp\) at \$280\.13/);
    expect(proposedTrades(check)[3]).toMatchObject({ line: "Pasted ticket 4", reason: "Price must be a number above zero." });
  });

  it("says what Confirm will do, and afterwards what it did", () => {
    expect(pastedTicketsSummary(check, null)).toMatch(/^Record 1 trade in the ledger\. Hold 1 ticket .* Skip 1 ticket .* Couldn't read 1 ticket\.$/);
    expect(pastedTicketsSummary(check, 1)).toMatch(/^Recorded 1 trade in the ledger\. Held 1 ticket/);
  });
});
