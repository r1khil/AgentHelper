/** Hoot, the Owl Fund mascot. Shared by the server nudge loader and the client companion. */

import type { TourRecord } from "@/lib/tour/types";

export type HootMood = "idle" | "thinking" | "alert" | "wave" | "concerned" | "happy" | "sleepy";

export type NudgeKind = "earnings" | "sell_side" | "proposal" | "weekly" | "changelog" | "flag" | "tip";

export type HootNudge = {
  /** Stable per piece of content, so a dismissal sticks until something new happens. */
  id: string;
  kind: NudgeKind;
  /** 1 is most urgent. Only 1–4 (and page tips) may interrupt with a speech bubble. */
  priority: number;
  title: string;
  detail?: string;
  href: string;
  mood: HootMood;
  /** When it's due or since when it's been waiting (ISO time, or a New York date for earnings and weekly packs). */
  at?: string;
};

/** Per-user companion state, stored on profiles.hoot. */
export type HootState = {
  /** Missing means on: Hoot is shown until the member hides him. */
  enabled?: boolean;
  /** Nudge id → ISO time it was dismissed or opened. */
  dismissed?: Record<string, string>;
  /** Guided tours (tour id → progress). Kept apart from `dismissed`, which is pruned after 60 days. */
  tours?: Record<string, TourRecord>;
  /** Pages with a choice of layout. Backtesting can stay on the classic layout; missing means the new one. */
  layouts?: { backtesting?: "new" | "classic" };
};

export type HootFeed = { nudges: HootNudge[]; seenTips: string[]; marketOpen: boolean };

export const BUBBLE_MAX_PRIORITY = 4;

export function hootEnabled(state: HootState | null | undefined) {
  return state?.enabled !== false;
}
