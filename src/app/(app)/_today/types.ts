// Plain, serializable shapes the Today components render. The loaders in load.ts and today-view.tsx fill them.

export type Effects = { allocation: number; selection: number; interaction: number };

export type BriefSource = { id: string; title: string; url?: string; publisher: string };

export type Brief = {
  paragraphs: string[];
  sources: BriefSource[];
  /** The fund's return has been revised since Hoot wrote it (a late close or a ledger fix). */
  stale: boolean;
  /** When the evening job finished, ISO. */
  writtenAt: string | null;
};

/** The last session for the book this reader may see: the whole fund, or a lead's own team. */
export type Book =
  | {
      kind: "fund" | "team";
      sessionDate: string;
      /** "Owl Fund" or the team's name, beside the hero figure. */
      label: string;
      /** Return in percent. */
      ret: number;
      /** The 3-up under the hero: benchmark %, then differences in bp. */
      cells: { label: string; value: number | null; unit: "%" | " bp"; tone: boolean }[];
      /** Allocation, selection and interaction against the sector benchmark, in decimals. */
      effects: Effects | null;
      /** Per holding, in decimals. */
      holdings: { ticker: string; teamId: string | null; ret: number; contribution: number }[];
      /** Return and contribution to the fund per team id, in decimals. */
      teams: Record<string, { ret: number; contribution: number }>;
      href: string;
      brief: Brief | null;
      /** Hoot's first sentence under the greeting, e.g. "We beat the S&P 500 by 25 bps on Friday." */
      sentence: string | null;
    }
  | { kind: "none"; message: string };

export type TeamHolding = {
  id: string;
  ticker: string;
  href: string;
  price: number | null;
  changePct: number | null;
  relativePp: number | null;
  /** "Oct 15" or "Oct 15 est.", or null. */
  nextReport: string | null;
  owner: string | null;
};

export type TeamRowData = {
  id: string;
  name: string;
  holdings: TeamHolding[];
  /** Last session, when the reader may see P&L for this team. Decimals. */
  stats: { ret: number; contribution: number } | null;
  /** The holding that moved most: last session's return, or today's live move for readers without the book. */
  mover: { ticker: string; pct: number } | null;
};

export type AgendaItem = { date: string; text: string };
