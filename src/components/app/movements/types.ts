import type { Feedback } from "@/db/schema";

export type MovementStatus = "open" | "in_progress" | "completed";

/** One row of the movements list (left column). */
export type MovementListItem = {
  id: string;
  href: string;
  ticker: string;
  /** Relative move vs the S&P 500 in pp; null when the close data had a problem. */
  relativePp: number | null;
  dataQuality: string | null;
  status: MovementStatus;
  overdue: boolean;
  /** YYYY-MM-DD */
  sessionDate: string;
  /** Who completed the write-up; null while it is unfinished. */
  completedByName: string | null;
  teamName: string | null;
};

export type MovementEvidence = {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  publisher: string | null;
  publishedAt: Date | null;
  retrievedAt: Date;
  /** The lookup for this source failed; the row records that it was tried. */
  failed: boolean;
};

/** Everything the detail pane shows for the selected movement. */
export type MovementDetailData = {
  id: string;
  ticker: string;
  companyName: string;
  holdingHref: string;
  askHootHref: string;
  sessionDate: string;
  holdingReturnPct: number | null;
  spxReturnPct: number | null;
  relativePp: number | null;
  dataQuality: string | null;
  status: MovementStatus;
  overdue: boolean;
  dueAt: Date | null;
  completedAt: Date | null;
  /** Who completed it. Anyone on the team can; a write-up belongs to the whole team. */
  completedByName: string | null;
  /** The team that holds the stock and owes the write-up. */
  teamName: string;
  leadNames: string[];
  updateText: string | null;
  feedback: Feedback | null;
  evidenceStatus: string;
  evidence: MovementEvidence[];
  agentConfigured: boolean;
};
