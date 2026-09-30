"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { DISCOUNT_RATE_MAX, DISCOUNT_RATE_MIN, setScreenerDiscountRate } from "@/lib/screener/discount-rate";

/**
 * Set the fund-wide reverse-DCF discount rate. Execs and admins only. Accepts a fraction (0.1) or a percent (10);
 * anything outside 4–20% is refused.
 */
export async function setScreenerDiscountRateAction(input: number | FormData): Promise<{ ok: true; rate: number } | { ok: false; error: string }> {
  const user = await requireRole("exec", "admin");
  const raw = input instanceof FormData ? Number(input.get("rate")) : Number(input);
  const rate = raw > 1 ? raw / 100 : raw;
  if (!Number.isFinite(rate) || rate < DISCOUNT_RATE_MIN || rate > DISCOUNT_RATE_MAX) return { ok: false, error: `Enter a rate between ${DISCOUNT_RATE_MIN * 100}% and ${DISCOUNT_RATE_MAX * 100}%.` };
  await setScreenerDiscountRate(+rate.toFixed(4), user.id);
  revalidatePath("/screener", "layout");
  return { ok: true, rate: +rate.toFixed(4) };
}
