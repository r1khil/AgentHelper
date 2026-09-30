import "server-only";
import { getSetting, setSetting } from "@/lib/settings";
import { DEFAULT_DISCOUNT_RATE } from "./reverse-dcf";

/** The fund-wide discount rate the reverse DCF uses (app_settings), as a fraction. */
export const DISCOUNT_RATE_SETTING = "screener_discount_rate";

/** Rates outside this range are almost certainly a typo (10 meant as 10%) and are refused. */
export const DISCOUNT_RATE_MIN = 0.04;
export const DISCOUNT_RATE_MAX = 0.2;

export function parseDiscountRate(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const v = Number(raw);
  return Number.isFinite(v) && v >= DISCOUNT_RATE_MIN && v <= DISCOUNT_RATE_MAX ? v : null;
}

/** The saved rate, or 10% when none is saved (or the saved one is out of range). */
export async function getScreenerDiscountRate(): Promise<number> {
  return parseDiscountRate(await getSetting(DISCOUNT_RATE_SETTING).catch(() => null)) ?? DEFAULT_DISCOUNT_RATE;
}

/** Save the rate. Callers check the role (execs and admins; see src/lib/actions/screener-discount-rate.ts). */
export async function setScreenerDiscountRate(rate: number, updatedBy: string | null): Promise<void> {
  if (parseDiscountRate(String(rate)) === null) throw new Error(`Discount rate must be between ${DISCOUNT_RATE_MIN * 100}% and ${DISCOUNT_RATE_MAX * 100}%`);
  await setSetting(DISCOUNT_RATE_SETTING, String(rate), updatedBy);
}
