import { describe, expect, it } from "vitest";
import { documentLabel, type DocumentLabelInput } from "./labels";

const earnings = (name: string, documentHeading?: string): DocumentLabelInput => ({ kind: "earnings_update", name, documentHeading });

describe("documentLabel", () => {
  it.each([
    ["AMZN_1Q_25 Earnings Update.docx", "Earnings update"],
    ["AMZN 1Q_25 Earnings Deck.pptx", "Earnings update"],
    ["NVDA Q2 FY2026 Results Presentation.pdf", "Earnings update"],
    ["AXP Q2 2026 earnings review.docx", "Earnings update"],
    ["AMZN_1Q_25 Pre-Earnings.docx", "Pre-earnings"],
    ["AMZN_4Q_24 Pre Earnings.pdf", "Pre-earnings"],
    ["MSFT_Q3_2026_PRE_EARNINGS.pptx", "Pre-earnings"],
    ["NVDA Q2 FY2026 PreEarnings.pdf", "Pre-earnings"],
    ["AXP Earnings Preview.docx", "Pre-earnings"],
    ["AAPL Pre‑Earnings Update.pptx", "Pre-earnings"],
    ["GOOG pre–earnings deck.pptx", "Pre-earnings"],
    ["AMZN Q1 2025 Earnings Call Transcript.pdf", "Earnings transcript"],
    ["MSFT_Q2_26_TRANSCRIPT.pdf", "Earnings transcript"],
    ["Amazon.com, Inc. - Q3 2024 Corrected Transcript.pdf", "Earnings transcript"],
    ["1) AMZN Major Movement Update.docx", "Major movement"],
    ["AMZN_1Q_25.pdf", "Earnings update"],
  ])("labels %s as %s without adding a period", (name, label) => {
    expect(documentLabel(earnings(name))).toBe(label);
  });

  it.each([
    ["model", "Model"],
    ["initiating_coverage", "Initiating coverage"],
    ["other", "Other"],
    [null, "Other"],
  ] as const)("leaves the existing %s category alone", (kind, label) => {
    expect(documentLabel({ kind, name: "AMZN Pre-Earnings Transcript.pdf", documentHeading: "Earnings Call Transcript" })).toBe(label);
  });

  it.each([
    ["Amazon.com, Inc. Q3 2024 Earnings Call Transcript", "Earnings transcript"],
    ["--- Slide 1 ---\nAmazon.com, Inc.\nQ1 2025 Pre-Earnings", "Pre-earnings"],
    ["Amazon.com, Inc.\nQ1 2025 Earnings Presentation", "Earnings update"],
    ["Corrected Transcript\nAmazon.com, Inc.", "Earnings transcript"],
  ])("uses a document heading for a generic exported filename", (heading, label) => {
    expect(documentLabel(earnings("Amazon.com, Inc. Q1 2025.pdf", heading))).toBe(label);
  });

  it("uses the actual transcript heading even when the filename calls it an update", () => {
    expect(documentLabel(earnings("AMZN Earnings Update.pdf", "Amazon.com, Inc.\nEarnings Call Transcript"))).toBe("Earnings transcript");
  });

  it("does not mistake transcript references in an update for its type", () => {
    expect(documentLabel(earnings("AMZN Q1.pdf", "Earnings Update\nSee the Earnings Call Transcript"))).toBe("Earnings update");
    expect(documentLabel(earnings("AMZN Q1.pdf", "See the Earnings Call Transcript for details"))).toBe("Earnings update");
    expect(documentLabel(earnings("AMZN Q1.pdf", "Previous Pre-Earnings expectations"))).toBe("Earnings update");
  });

  it("ignores distant body text and long paragraphs", () => {
    const body = `${"Revenue grew strongly. ".repeat(10)}Earnings Call Transcript`;
    expect(documentLabel(earnings("AMZN Q1.pdf", body))).toBe("Earnings update");
    expect(documentLabel(earnings("AMZN Q1.pdf", `${"Title\n".repeat(8)}Pre-Earnings`))).toBe("Earnings update");
    expect(documentLabel(earnings("AMZN Q1.pdf", `${" ".repeat(1200)}Earnings Transcript`))).toBe("Earnings update");
  });

  it("does not mutate the stored category or document name", () => {
    const file = Object.freeze(earnings("AMZN_1Q_25 Pre-Earnings.docx"));
    expect(documentLabel(file)).toBe("Pre-earnings");
    expect(file.kind).toBe("earnings_update");
    expect(file.name).toBe("AMZN_1Q_25 Pre-Earnings.docx");
  });
});
