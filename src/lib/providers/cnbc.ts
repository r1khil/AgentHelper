import { cached } from "./cache";
import { retry } from "./limiter";

/**
 * CNBC's public chart feed (the one behind cnbc.com quote pages). It has daily closes for S&P indexes Yahoo only quotes
 * live, such as the S&P 500 Value (.SVX) and Growth (.SGX). No key; unofficial, so callers treat a failure as a gap.
 */

/** An unofficial feed can stall; a stalled call must not hold up the Sunday email. */
const TIMEOUT_MS = 10_000;

export type CnbcBar = { date: string; close: number };

/** "20260921000000" -> "2026-09-21"; bars without a usable close are dropped. */
export function parseCnbcDailyBars(json: unknown): CnbcBar[] {
  const bars = (json as { barData?: { priceBars?: { close?: string; tradeTime?: string }[] } })?.barData?.priceBars;
  if (!Array.isArray(bars)) throw new Error("CNBC returned no price bars");
  const out: CnbcBar[] = [];
  for (const b of bars) {
    const m = b.tradeTime?.match(/^(\d{4})(\d{2})(\d{2})/);
    const close = Number(b.close);
    if (!m || !b.close || !Number.isFinite(close) || close <= 0) continue;
    out.push({ date: `${m[1]}-${m[2]}-${m[3]}`, close });
  }
  return out;
}

/** About two years of daily closes, oldest first. The session in progress is not in the feed until it closes. */
export async function getCnbcDailyBars(symbol: string): Promise<CnbcBar[]> {
  return cached(`cnbc:daily:${symbol}`, 60 * 60, async () => {
    const url = `https://ts-api.cnbc.com/harmony/app/charts/1Y.json?symbol=${encodeURIComponent(symbol)}`;
    const json = await retry(async () => {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`CNBC ${res.status} for ${symbol}`);
      return res.json();
    });
    return parseCnbcDailyBars(json);
  });
}
