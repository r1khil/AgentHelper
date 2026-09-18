/** Timing rules for the Drive notification channel. Pure. */
export const WATCH_RENEW_LEAD_MS = 36 * 3600_000;
/** Drive channels last about a week at most; ask for that and store what Google grants. */
export const WATCH_TTL_MS = 7 * 24 * 3600_000;
export const LAZY_SYNC_WITH_WATCH_MS = 6 * 3600_000;
export const LAZY_SYNC_WITHOUT_WATCH_MS = 10 * 60_000;

export type WatchState = { channelId: string | null; channelExpiration: Date | null };

export function watchActive(conn: WatchState, now: Date): boolean {
  return Boolean(conn.channelId && conn.channelExpiration && conn.channelExpiration.getTime() > now.getTime());
}

/** Renew when there is no live channel or it expires within the lead time. */
export function watchNeedsRenewal(conn: WatchState, now: Date, leadMs = WATCH_RENEW_LEAD_MS): boolean {
  if (!watchActive(conn, now)) return true;
  return conn.channelExpiration!.getTime() - now.getTime() < leadMs;
}

/** How stale the index may be before a request path triggers a sync: relaxed while notifications are flowing. */
export function lazySyncMaxAge(conn: WatchState, now: Date): number {
  return watchActive(conn, now) ? LAZY_SYNC_WITH_WATCH_MS : LAZY_SYNC_WITHOUT_WATCH_MS;
}
