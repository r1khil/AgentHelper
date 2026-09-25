import { describe, expect, it } from "vitest";
import { NOT_A_TICKET, parseTicket, UNREADABLE_DOCX, type TicketRead } from "@/lib/attribution/ticket";
import { describeTrade, docxAttachments, isTicketAttempt, ticketNotAllowedBody, ticketReplyBody, ticketTextInBody } from "./ticket-mail";

const SYK_TEXT = "Action (Buy, Sell):\tBuy\n\nEquity (Name, Ticker):\tStryker Corp (SYK)\n\nDate:\t9/18/2026\n\nPrice:\t$280.13\n\nNumber of Shares:\t83\n\nMarket Value:\t$23,250.79";
const SYK = parseTicket(SYK_TEXT, "Stryker Corp (SYK)_Trade Ticket (18-Sep-2026).docx");
const XLP = parseTicket(SYK_TEXT.replace("\tBuy", "\tSell").replace("Stryker Corp (SYK)", "Consumer Staples SPDR (XLP)").replace("$280.13", "$82.65").replace("\t83", "\t2,246").replace("$23,250.79", "$185,811.58"), "xlp.docx");

describe("docxAttachments", () => {
  it("keeps only Word files", () => {
    const got = docxAttachments([{ filename: "logo.png" }, { filename: "SYK Ticket.DOCX" }, { filename: "notes.pdf" }]);
    expect(got.map((a) => a.filename)).toEqual(["SYK Ticket.DOCX"]);
  });
});

describe("isTicketAttempt", () => {
  const read = (file: string, errors: string[]): TicketRead => ({ file, ticket: null, errors, warnings: [] });
  it("counts tickets and near-tickets, not memos attached to a question", () => {
    expect(isTicketAttempt(SYK)).toBe(true);
    expect(isTicketAttempt(read("x.docx", ["Price must be a number above zero."]))).toBe(true);
    expect(isTicketAttempt(read("Pitch memo.docx", [NOT_A_TICKET]))).toBe(false);
    expect(isTicketAttempt(read("broken.docx", [UNREADABLE_DOCX]))).toBe(false);
    expect(isTicketAttempt(read("KKR_Trade Ticket (18-Sep-2026).docx", [UNREADABLE_DOCX]))).toBe(true);
  });
});

describe("ticketTextInBody", () => {
  it("reads a forwarded ticket from its Action line, skipping the forward's own Date header", () => {
    const body = `FYI\n\n---------- Forwarded message ---------\nFrom: Saad Quddus <squddus@theowlfund.com>\nDate: Mon, Sep 21, 2026 at 4:02 PM\nSubject: SYK ticket\n\n${SYK_TEXT}`;
    const text = ticketTextInBody(body)!;
    expect(parseTicket(text, "body").ticket).toMatchObject({ ticker: "SYK", date: "2026-09-18", shares: 83 });
  });

  it("drops quote markers", () => {
    const quoted = SYK_TEXT.split("\n").map((l) => `> ${l}`).join("\n");
    expect(parseTicket(ticketTextInBody(quoted)!, "body").ticket?.ticker).toBe("SYK");
  });

  it("ignores emails that only mention an action", () => {
    expect(ticketTextInBody("Action: can you check why AXP fell today?")).toBeNull();
    expect(ticketTextInBody("Why did FIG underperform?")).toBeNull();
  });
});

describe("describeTrade", () => {
  it("reads like a sentence", () => {
    expect(describeTrade(SYK.ticket!)).toBe("Bought 83 SYK (Stryker Corp) at $280.13 on Sep 18, 2026");
    expect(describeTrade(XLP.ticket!)).toBe("Sold 2,246 XLP (Consumer Staples SPDR) at $82.65 on Sep 18, 2026");
  });
});

describe("ticketReplyBody", () => {
  const url = "https://owlfund-workspace.vercel.app/attribution/ledger";

  it("lists what was recorded, what to double-check, what was skipped and what couldn't be read", () => {
    const body = ticketReplyBody({
      name: "Saad",
      outcome: {
        reads: [SYK, XLP, { ...SYK, file: "kkr.docx", skip: "Already in the ledger." }, { file: "bad.docx", ticket: null, errors: ["Price must be a number above zero."], warnings: [] }],
        recorded: { ok: true, warning: "Cash is -$1,000.00 after this. Record the deposit or sale that funded it." },
      },
      ledgerUrl: url,
    });
    expect(body).toBe(
      [
        "Hi Saad,",
        "",
        "I recorded these 2 trades in the ledger:",
        "- Bought 83 SYK (Stryker Corp) at $280.13 on Sep 18, 2026",
        "- Sold 2,246 XLP (Consumer Staples SPDR) at $82.65 on Sep 18, 2026",
        "",
        "Please double-check:",
        "- XLP: Shares × price is $185,631.90, but the ticket says $185,811.58. One of them is a typo.",
        "",
        "Cash is -$1,000.00 after this. Record the deposit or sale that funded it.",
        "",
        "Already recorded, so I left these alone:",
        "- Bought 83 SYK (Stryker Corp) at $280.13 on Sep 18, 2026: Already in the ledger.",
        "",
        "I couldn't read these tickets:",
        "- bad.docx: Price must be a number above zero.",
        "",
        "Fix them and send them again. Tickets already in the ledger are skipped, so resending the whole set is safe.",
        "",
        `If something is wrong, void the trade on the Ledger page: ${url}`,
        "",
        "Best,",
        "Hoot",
      ].join("\n"),
    );
  });

  it("says nothing was added when the import refuses the batch", () => {
    const body = ticketReplyBody({ name: "Aadi", outcome: { reads: [SYK], recorded: { ok: false, error: "That would sell 10.0000 more SYK shares than the Fund held on 2026-09-18." } }, ledgerUrl: url });
    expect(body).toContain("I couldn't record this ticket, so nothing was added to the ledger:");
    expect(body).toContain("The problem: That would sell 10.0000 more SYK");
    expect(body).not.toContain("void the trade");
  });

  it("says nothing new went in when every ticket was already there", () => {
    const body = ticketReplyBody({ name: "Max", outcome: { reads: [{ ...SYK, skip: "Already in the ledger." }], recorded: null }, ledgerUrl: url });
    expect(body).toMatch(/^Hi Max,\n\nNothing new went into the ledger from this email\.\n\nAlready recorded/);
  });
});

describe("ticketReplyBody with a far-off price", () => {
  it("holds the ticket back and points to the Ledger page", () => {
    const warning = "$90 is 26.9% above that day's close of $70.94. Check it is the price the trade filled at.";
    const held = { ...SYK, warnings: [warning], priceGap: 0.269 };
    const body = ticketReplyBody({ name: "Saad", outcome: { reads: [], held: [held], recorded: null }, ledgerUrl: "https://x.app/attribution/ledger" });
    expect(body).toBe(
      [
        "Hi Saad,",
        "",
        "Nothing new went into the ledger from this email.",
        "",
        "I held back this ticket because the price looks off:",
        `- Bought 83 SYK (Stryker Corp) at $280.13 on Sep 18, 2026: ${warning}`,
        "",
        "If the ticket has a typo, fix it and send it again. If the price is right, upload the ticket on the Ledger page (https://x.app/attribution/ledger), where you can confirm it.",
        "",
        "Best,",
        "Hoot",
      ].join("\n"),
    );
  });
});

describe("ticketNotAllowedBody", () => {
  it("tells an analyst to go through an exec", () => {
    expect(ticketNotAllowedBody({ name: "Jo", reason: "role" })).toContain("Only execs and admins can record trades");
  });
});
