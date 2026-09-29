import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { holdings, teams } from "@/db/schema";
import { isFundWide } from "@/lib/roles";
import { PERIOD_KEYS } from "@/lib/attribution/periods";
import { APP_PAGES, resolveNavigation, type AppPage, type HootAction } from "@/lib/hoot/app-actions";
import type { CurrentUser } from "@/lib/auth";
import type { PageContext } from "./page-context";
import type { ToolResult } from "./tools";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const PAGES = ["holding", ...(Object.keys(APP_PAGES) as (keyof typeof APP_PAGES)[])] as [AppPage, ...AppPage[]];

/** The action rides on the result; the browser applies it once as it streams in (never when a saved chat is reopened). */
const acted = (action: HootAction, note: string): ToolResult<unknown> => ({ data: { action, note }, sources: [] });

/**
 * Hoot operating the app for the member who asked: open one of their pages, with the period, lookback or trade it
 * shows, or change the theme. Every page is resolved against what that member's own sidebar offers, so Hoot can never
 * open more than they could by clicking.
 */
export function makeAppTools(ctx: { viewer: CurrentUser; page?: PageContext | null }) {
  const { viewer } = ctx;
  return {
    navigate: tool({
      description:
        "Open a page of the app for the member, now, without asking first: when they ask to go to, open, pull up or switch to a page, a team (sector), a holding, or a view (a period, a lookback, a trade to replay). Not for a question about a figure: answer that in the chat. Pages: home, portfolio (the Fund's overview), team (a team's page; team 'fund' is the Fund's), research, movements, models, sell_side, earnings, economic_calendar, performance (attribution; period 1d/7d/1m/6m/ytd/1y/itd, or custom with from/to), performance_today, risk and exposure (lookback 6m/1y/2y), backtesting (trade: replay one trade), activity (trade ledger), weekly, changelog, admin, holding (with ticker). Team is a slug, name or abbreviation (fig, tech, Healthcare, C&CS) or 'fund'; leave it out to stay in the scope the member is in. The member only gets pages they can already open; an error says why not. After it succeeds, say in one short sentence what you opened; don't research unless they also asked a question.",
      inputSchema: z.object({
        page: z.enum(PAGES),
        team: z.string().max(60).optional(),
        ticker: z.string().max(12).optional().describe("For page 'holding'"),
        period: z.enum(PERIOD_KEYS).optional().describe("For page 'performance'"),
        from: iso.optional().describe("Performance with period 'custom', or backtesting"),
        to: iso.optional(),
        lookback: z.enum(["6m", "1y", "2y"]).optional().describe("For risk and exposure"),
        trade: z
          .object({ ticker: z.string().max(12), changePp: z.number().min(-100).max(100), fundFrom: z.string().max(12).describe("'cash', 'pro_rata' or a holding's ticker") })
          .optional()
          .describe("For backtesting: start a scenario with this one trade"),
      }),
      execute: async (req): Promise<ToolResult<unknown>> => {
        try {
          const teamRows = isFundWide(viewer) ? await db.select({ id: teams.id, slug: teams.slug, name: teams.name }).from(teams).orderBy(teams.sortOrder) : viewer.team ? [viewer.team] : [];
          const held = req.page === "holding" && teamRows.length
            ? await db
                .select({ ticker: holdings.ticker, teamSlug: teams.slug })
                .from(holdings)
                .innerJoin(teams, eq(teams.id, holdings.teamId))
                .where(and(inArray(holdings.teamId, teamRows.map((t) => t.id)), eq(holdings.status, "active")))
            : [];
          const r = resolveNavigation(req, { viewer: { role: viewer.role, teamId: viewer.teamId }, teams: teamRows, path: ctx.page?.path ?? null, holdings: held });
          if ("error" in r) return { data: null, sources: [], error: r.error };
          return acted(r.action, `Opening ${r.action.label} for the member now.`);
        } catch (e) {
          return { data: null, sources: [], error: e instanceof Error ? e.message : String(e) };
        }
      },
    }),

    set_theme: tool({
      description: "Switch the app to light mode, dark mode, or following the device ('system'), for this member, now. Use it whenever they ask to change the theme, colors or dark/light mode.",
      inputSchema: z.object({ theme: z.enum(["light", "dark", "system"]) }),
      execute: async ({ theme }): Promise<ToolResult<unknown>> => acted({ kind: "theme", theme }, theme === "system" ? "The app now follows the device's theme." : `${theme === "light" ? "Light" : "Dark"} mode is on.`),
    }),
  };
}
