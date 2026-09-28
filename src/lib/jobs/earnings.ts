import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { earnings, holdings } from "@/db/schema";
import { getEarningsDate } from "@/lib/providers/yahoo";
import { getEarningsCalendar } from "@/lib/providers/finnhub";
import { todayNY } from "@/lib/providers/calendar";
import type { EarningsDate } from "@/lib/providers/types";

/** Consensus EPS and revenue, Yahoo first, each with the currency of the provider that supplied that figure. */
export function consensusFigures(y: EarningsDate | null | undefined, f: EarningsDate | null | undefined) {
  const eps = y?.epsEstimate != null ? y : f;
  const revenue = y?.revenueEstimate != null ? y : f;
  return {
    epsEstimate: eps?.epsEstimate?.toString() ?? null,
    epsCurrency: (eps?.epsEstimate != null && eps.epsCurrency) || null,
    revenueEstimate: revenue?.revenueEstimate?.toString() ?? null,
    revenueCurrency: (revenue?.revenueEstimate != null && revenue.revenueCurrency) || null,
  };
}

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
        const figures = consensusFigures(y, next);
        await db
          .insert(earnings)
          .values({
            holdingId: h.id,
            reportDate: date,
            reportHour: next?.hour ?? null,
            dateStatus: status,
            dateSourceUrl: y?.sourceUrl ?? null,
            ...figures,
            fiscalPeriod: next?.fiscalPeriod ?? null,
          })
          .onConflictDoUpdate({
            target: [earnings.holdingId, earnings.reportDate],
            set: { dateStatus: status, reportHour: next?.hour ?? null, ...figures },
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
