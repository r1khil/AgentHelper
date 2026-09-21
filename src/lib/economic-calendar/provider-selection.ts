import { biquoteProvider } from "./biquote-provider";
import { createHash } from "node:crypto";
import { tradingEconomicsProvider, eodhdProvider } from "./dedicated-providers";
import { publicCalendarProvider } from "./public-provider";
import type {
  CalendarRange,
  CalendarSourceStatus,
  EconomicCalendarProvider,
} from "./types";

export function calendarConfiguration(
  env: Record<string, string | undefined> = process.env,
) {
  const te = env.TRADING_ECONOMICS_API_KEY?.trim();
  const eod = env.EODHD_API_KEY?.trim();
  const timezone = env.EODHD_CALENDAR_TIMEZONE?.trim() ?? "";
  const mode = env.ECONOMIC_CALENDAR_PROVIDER?.trim() || "auto";
  if (!["auto", "biquote", "public"].includes(mode))
    throw new Error("Invalid calendar provider setting");
  return {
    mode,
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
export async function loadConfiguredCalendar(
  range: CalendarRange,
  config = calendarConfiguration(),
  fetcher: typeof fetch = fetch,
) {
  if (
    config.mode === "biquote" ||
    (config.mode === "auto" && !config.te && !config.eod)
  ) {
    const provider = biquoteProvider(fetcher);
    return { ...(await provider.getEvents(range)), provider: provider.name };
  }
  const providers: EconomicCalendarProvider[] = [];
  if (config.mode !== "public" && config.te)
    providers.push(tradingEconomicsProvider(config.te, fetcher));
  if (config.mode !== "public" && config.eod)
    providers.push(eodhdProvider(config.eod, config.timezone, fetcher));
  if (!providers.length) {
    const provider = publicCalendarProvider(fetcher);
    const result = await provider.getEvents(range);
    return {
      ...result,
      provider: provider.name,
      coverage: {
        status: "partial" as const,
        message: `Public agency fallback selected. ${result.coverage?.message ?? ""}`,
      },
    };
  }
  const failures: CalendarSourceStatus[] = [];
  for (const provider of providers) {
    try {
      const result = await provider.getEvents(range);
      return {
        ...result,
        provider: provider.name,
        sources: [...failures, ...(result.sources ?? [])],
      };
    } catch (error) {
      const code =
        error instanceof Error && /^HTTP \d{3}$/.test(error.message)
          ? error.message
          : "Feed could not be loaded or validated; check API access and configuration";
      failures.push({
        name: provider.name,
        url:
          provider.name === "EODHD"
            ? "https://eodhd.com/financial-apis/economic-events-data-api"
            : "https://docs.tradingeconomics.com/economic_calendar/",
        status: "unavailable",
        count: 0,
        error: code,
      });
    }
  }
  // Do not disguise a paid-feed outage as a successful schedule-only feed.
  throw new Error(
    "Configured calendar providers are unavailable. Check calendar API access and configuration.",
  );
}
