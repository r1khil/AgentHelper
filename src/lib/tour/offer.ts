import type { Role } from "@/db/schema";
import type { HootState } from "@/lib/hoot/types";
import type { Tour, TourOffer, TourRecord } from "./types";

/** "Later" means later: the offer comes back on the first full page load a day after. */
export const LATER_MS = 24 * 60 * 60_000;

/** Execs and admins see every page the what's-new tour visits, so it's theirs. */
export function tourAudience(role: Role) {
  return role === "exec" || role === "admin";
}

/**
 * Whether this page load should open the tour, and how: a first offer, a second offer after "Later", or picking
 * up where a refresh interrupted it. Finished or declined tours only come back through Replay.
 */
export function tourOffer(tour: Tour, role: Role, hoot: HootState | null | undefined, now = new Date()): TourOffer | null {
  if (!tourAudience(role)) return null;
  const rec: TourRecord | undefined = hoot?.tours?.[tour.id];
  if (!rec) return { mode: "new", themed: false };
  const themed = !!rec.themed;
  if (rec.status === "done") return null;
  if (rec.status === "later") {
    const at = Date.parse(rec.at);
    return Number.isFinite(at) && now.getTime() - at < LATER_MS ? null : { mode: "later", themed };
  }
  const chapter = tour.chapters.some((c) => c.id === rec.chapter) ? rec.chapter : undefined;
  return { mode: "resume", chapter, themed };
}

/** Accepts only a well-formed record for this tour, so a hand-crafted call can't write junk onto the profile. */
export function cleanTourRecord(tour: Tour, input: unknown, now = new Date()): TourRecord | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  if (r.status !== "active" && r.status !== "later" && r.status !== "done") return null;
  const chapter = typeof r.chapter === "string" && tour.chapters.some((c) => c.id === r.chapter) ? r.chapter : undefined;
  return { status: r.status, ...(chapter ? { chapter } : {}), ...(r.themed === true ? { themed: true } : {}), at: now.toISOString() };
}
