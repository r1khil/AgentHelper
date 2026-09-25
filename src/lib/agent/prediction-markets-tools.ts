import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { MAX_SPREAD, MIN_VOLUME, searchKalshi, searchPolymarket, type PredictionMarket, type VenueResult } from "@/lib/providers/prediction-markets";
import { sourceId, type Source } from "@/lib/providers/types";
import type { ToolResult } from "./tools";

function fail<T>(e: unknown, data: T): ToolResult<T> {
  return { data, sources: [], error: e instanceof Error ? e.message : String(e) };
}

/** One line a citation can show: the headline odds with the volume behind them. */
function excerpt(m: PredictionMarket) {
  const head = m.impliedMedian
    ? `Implied median ${m.impliedMedian}`
    : m.likeliest
      ? `Likeliest: ${m.likeliest.label} ${m.likeliest.probabilityPct}%`
      : m.outcomes.map((o) => `${o.label} ${o.probabilityPct}%`).slice(0, 3).join("; ");
  return `${head}. Volume ${m.volume.toLocaleString("en-US")} ${m.volumeUnit}${m.closes ? `, closes ${m.closes.slice(0, 10)}` : ""}.`;
}

function marketSource(m: PredictionMarket, retrievedAt: string): Source {
  return {
    id: sourceId("pm", `${m.venue}:${m.id}`),
    title: `${m.venue}: ${m.title}`,
    url: m.url,
    publisher: m.venue,
    sourceType: "Prediction market",
    excerpt: excerpt(m).slice(0, 360),
    retrievedAt,
  };
}

/** Prediction-market odds from Kalshi and Polymarket. Public data, no key and no viewer needed. */
export function makePredictionMarketTools() {
  return {
    get_market_odds: tool({
      description:
        "Live prediction-market odds from Kalshi and Polymarket for a macro, policy, political or company event (a Fed decision, CPI or payrolls, recession, a shutdown or tariff, an IPO or deal). Each result is an open market: its question, the implied probability (bid/ask midpoint) per outcome, bid/ask spread, lifetime volume, open interest or liquidity, close date and a link; ladders of \"above X\" contracts also give the implied median and the likeliest range. A market price is a crowd probability from traders with money at stake, not a survey or a forecast by economists: never present it as consensus or mix it into get_analyst_estimates or the calendar's consensus figures; say \"Kalshi traders price a 66% chance\" and cite it. Weigh odds by volume and spread: thin markets (spread over 20 points or tiny volume) are already dropped and counted in `dropped`; mention when what remains is still light. Kalshi and Polymarket can disagree; when both have the question, show both side by side rather than picking one. Kalshi matches series by keyword, so use short plain terms (\"fed rate\", \"CPI\", \"recession\", \"government shutdown\"); if one phrasing finds nothing, try another once.",
      inputSchema: z.object({
        query: z.string().min(2).max(120).describe("Short plain-English terms, e.g. 'fed rate cut', 'CPI', 'recession', 'Nvidia'"),
        venue: z.enum(["kalshi", "polymarket", "both"]).default("both"),
        limit: z.number().int().min(1).max(10).default(5).describe("Most markets to return per venue"),
      }),
      execute: async ({ query, venue, limit }): Promise<ToolResult<unknown>> => {
        try {
          const venues = venue === "both" ? (["kalshi", "polymarket"] as const) : ([venue] as const);
          const settled = await Promise.allSettled(venues.map((v) => (v === "kalshi" ? searchKalshi(query, limit) : searchPolymarket(query, limit))));
          if (settled.every((s) => s.status === "rejected")) throw (settled[0] as PromiseRejectedResult).reason;
          const retrievedAt = new Date().toISOString();
          const sources: Source[] = [];
          const markets: (PredictionMarket & { sourceId: string })[] = [];
          const dropped: Record<string, VenueResult["dropped"]> = {};
          const unavailable: Record<string, string> = {};
          settled.forEach((s, i) => {
            const name = venues[i];
            if (s.status === "rejected") {
              unavailable[name] = s.reason instanceof Error ? s.reason.message : String(s.reason);
              return;
            }
            dropped[name] = s.value.dropped;
            for (const m of s.value.markets) {
              const src = marketSource(m, retrievedAt);
              sources.push(src);
              markets.push({ ...m, sourceId: src.id });
            }
          });
          return {
            data: {
              query,
              retrievedAt,
              markets,
              dropped: { ...dropped, rule: `contracts with a spread over ${MAX_SPREAD * 100} points or lifetime volume under ${MIN_VOLUME.toLocaleString("en-US")} (contracts on Kalshi, dollars on Polymarket); a ladder is judged on its total volume` },
              ...(Object.keys(unavailable).length ? { unavailable } : {}),
              note: markets.length
                ? "Probabilities are market prices (crowd odds), not a survey or consensus forecast. Kalshi volume is contracts, Polymarket volume is dollars."
                : "No open, liquid market matched. Try other short terms, or say no market prices this.",
            },
            sources,
          };
        } catch (e) {
          return fail(e, null);
        }
      },
    }),
  };
}
