import { biquoteProvider } from "./biquote-provider";
import { createHash } from "node:crypto";
import { tradingEconomicsProvider, eodhdProvider } from "./dedicated-providers";
import { publicCalendarProvider } from "./public-provider";
import { tradingViewProvider } from "./tradingview-provider";
import type {
  CalendarRange,
  CalendarSourceStatus,
  EconomicCalendarProvider,
} from "./types";

/** Free feeds, best first: full schedule with consensus, then no consensus, then agency schedules only. */
const FREE = ["tradingview", "biquote", "public"] as const;
type FreeMode = (typeof FREE)[number];
const MODES: readonly string[] = ["auto", ...FREE];

/** Don't start another fallback after this long; the calendar route gets 30 s in all. */
export const FALLBACK_DEADLINE_MS = 18_000;

export function calendarConfiguration(
  env: Record<string, string | undefined> = process.env,
) {
  const te = env.TRADING_ECONOMICS_API_KEY?.trim();
  const eod = env.EODHD_API_KEY?.trim();
  const timezone = env.EODHD_CALENDAR_TIMEZONE?.trim() ?? "";
  const mode = env.ECONOMIC_CALENDAR_PROVIDER?.trim() || "auto";
  if (!MODES.includes(mode))
    throw new Error("Invalid calendar provider setting");
  return {
    mode: mode as "auto" | FreeMode,
    te,
    eod,
    timezone,
    // Scope cache entries to credentials without placing secrets in cache/trace keys.
    cacheScope: createHash("sha256")
      .update(JSON.stringify([mode, te, eod, timezone]))
      .digest("hex")
      .slice(0, 24),
  };
}

/**
 * The order providers are tried in. `auto` puts paid keys first, then the free feeds. Naming a free
 * feed puts it first and ignores paid keys, with the other free feeds kept behind it as fallbacks.
 */
export function providerChain(
  config: ReturnType<typeof calendarConfiguration>,
  fetcher: typeof fetch = fetch,
): EconomicCalendarProvider[] {
  const free: Record<FreeMode, () => EconomicCalendarProvider> = {
    tradingview: () => tradingViewProvider(fetcher),
    biquote: () => biquoteProvider(fetcher),
    public: () => publicCalendarProvider(fetcher),
  };
  const paid: EconomicCalendarProvider[] = [];
  if (config.mode === "auto" && config.te)
    paid.push(tradingEconomicsProvider(config.te, fetcher));
  if (config.mode === "auto" && config.eod)
    paid.push(eodhdProvider(config.eod, config.timezone, fetcher));
  const order =
    config.mode === "auto"
      ? FREE
      : [config.mode, ...FREE.filter((m) => m !== config.mode)];
  return [...paid, ...order.map((m) => free[m]())];
}

/** Thrown when every provider failed; carries only safe per-provider status codes. */
export class CalendarUnavailableError extends Error {
  constructor(readonly sources: CalendarSourceStatus[]) {
    super(
      "Calendar providers are unavailable. Check calendar API access and configuration.",
    );
  }
}

function safeError(error: unknown) {
  if (error instanceof Error && error.name === "TimeoutError")
    return "Timed out";
  // Only expose operational codes, never upstream bodies or credential-bearing URLs.
  return error instanceof Error && /^HTTP \d{3}$/.test(error.message)
    ? error.message
    : "Feed could not be loaded or validated";
}

export async function loadConfiguredCalendar(
  range: CalendarRange,
  config = calendarConfiguration(),
  fetcher: typeof fetch = fetch,
) {
  const started = Date.now();
  const failures: CalendarSourceStatus[] = [];
  for (const provider of providerChain(config, fetcher)) {
    if (Date.now() - started > FALLBACK_DEADLINE_MS) break;
    try {
      const result = await provider.getEvents(range);
      if (!failures.length) return { ...result, provider: provider.name };
      // A fallback is never passed off as the preferred feed: say what failed and what is showing.
      const failed = failures.map((f) => `${f.name} (${f.error})`).join(", ");
      return {
        ...result,
        provider: provider.name,
        sources: [...failures, ...(result.sources ?? [])],
        coverage: {
          status: "partial" as const,
          message: [
            `${failed} ${failures.length > 1 ? "are" : "is"} unavailable, so this view comes from ${provider.name}.`,
            result.coverage?.message,
          ]
            .filter(Boolean)
            .join(" "),
        },
      };
    } catch (error) {
      failures.push({
        name: provider.name,
        url: provider.url,
        status: "unavailable",
        count: 0,
        error: safeError(error),
      });
    }
  }
  throw new CalendarUnavailableError(failures);
}
