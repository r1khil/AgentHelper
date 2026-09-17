import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { earnings, holdings } from "@/db/schema";
import { getEarningsDate } from "@/lib/providers/yahoo";
import { getEarningsCalendar } from "@/lib/providers/finnhub";
import { todayNY } from "@/lib/providers/calendar";

/** Refresh the next earnings date for every active holding; flip past events to "reported". */
export async function refreshEarningsCalendar() {
  const active = await db.select().from(holdings).where(eq(holdings.status, "active"));
  const today = todayNY();
  let updated = 0;
  let reported = 0;
  const errors: Record<string, string> = {};
  for (const h of active) {
    try {
      const [y, f] = await Promise.all([getEarningsDate(h.ticker).catch(() => null), getEarningsCalendar(h.ticker).catch(() => [])]);
      const next = f.find((e) => e.date >= today);
      const date = y?.date && y.date >= today ? y.date : next?.date;
      if (date) {
        const status: "confirmed" | "estimated" = y && y.date === date && y.isEstimate === false ? "confirmed" : "estimated";
        await db
          .insert(earnings)
          .values({
            holdingId: h.id,
            reportDate: date,
            reportHour: next?.hour ?? null,
            dateStatus: status,
            dateSourceUrl: y?.sourceUrl ?? null,
            epsEstimate: (y?.epsEstimate ?? next?.epsEstimate)?.toString() ?? null,
            revenueEstimate: (y?.revenueEstimate ?? next?.revenueEstimate)?.toString() ?? null,
            fiscalPeriod: next?.fiscalPeriod ?? null,
          })
          .onConflictDoUpdate({
            target: [earnings.holdingId, earnings.reportDate],
            set: { dateStatus: status, reportHour: next?.hour ?? null, epsEstimate: (y?.epsEstimate ?? next?.epsEstimate)?.toString() ?? null, revenueEstimate: (y?.revenueEstimate ?? next?.revenueEstimate)?.toString() ?? null },
          });
        updated++;
      }
      // Past-dated upcoming events become "reported" so the post-earnings flow can start.
      const stale = await db.select().from(earnings).where(and(eq(earnings.holdingId, h.id), eq(earnings.status, "upcoming")));
      for (const e of stale) {
        if (e.reportDate < today) {
          await db.update(earnings).set({ status: "reported", preLockedAt: e.preLockedAt ?? new Date() }).where(eq(earnings.id, e.id));
          reported++;
        }
      }
    } catch (e) {
      errors[h.ticker] = e instanceof Error ? e.message : String(e);
    }
  }
  return { holdings: active.length, updated, reported, errors };
}
