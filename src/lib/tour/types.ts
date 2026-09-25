import type { HootMood } from "@/lib/hoot/types";

/**
 * One stop on a guided tour. Hoot flies to `target`, the rest of the app dims, and his card explains the part in
 * plain English: what it is, how it works, and where its data comes from.
 */
export type TourStep = {
  id: string;
  /**
   * - `info`: explain the highlighted part; Next moves on.
   * - `go`: highlight a menu item and wait for the member to click it (done once the page matches the chapter).
   * - `wait`: ask the member to do something on the page; moves on once `until` appears.
   */
  kind: "info" | "go" | "wait";
  /** CSS selector for the part to highlight. The first visible match wins. Omitted: Hoot talks from the middle. */
  target?: string;
  title: string;
  /** A short lead-in, for steps that don't split into what / how / source. */
  body?: string;
  /** Short labeled lines under the title, e.g. "Beta: how much the fund tends to move when the S&P 500 moves 1%". */
  points?: { label: string; text: string }[];
  what?: string;
  how?: string;
  source?: string;
  /** For go and wait steps: what to click, e.g. "Click Risk in the menu to open it." */
  prompt?: string;
  /** For wait steps: the selector whose appearance means the member did it. */
  until?: string;
  /** How long to wait for a streamed-in target before giving up. Default 6s. */
  waitMs?: number;
  /** When the target never shows up: skip the step, or say `missing` from the middle of the screen. */
  ifMissing?: "skip" | "center";
  missing?: string;
  /** Example questions that fill Hoot's ask box (never sent). */
  examples?: string[];
  mood?: HootMood;
};

export type TourChapter = {
  id: string;
  label: string;
  /** Pathnames the chapter's steps live on. The chapter's `go` step is done once the page matches. */
  route: RegExp;
  steps: TourStep[];
};

export type Tour = {
  id: string;
  chapters: TourChapter[];
};

/** What the profile remembers about a tour (profiles.hoot.tours[id]). */
export type TourRecord = {
  status: "active" | "later" | "done";
  /** The chapter to pick up at after a refresh. */
  chapter?: string;
  /** The light / dark question was answered, so a later offer skips it. */
  themed?: boolean;
  at: string;
};

/** How the tour opens on this page load, decided on the server from the profile. */
export type TourOffer = { mode: "new" | "later" | "resume"; chapter?: string; themed: boolean };
