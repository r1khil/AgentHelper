import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { holdings, teams } from "@/db/schema";
import { isFundWide } from "@/lib/roles";
import { PERIOD_KEYS } from "@/lib/attribution/periods";
import { APP_PAGES, resolveNavigation, type AppPage, type HootAction } from "@/lib/hoot/app-actions";
import { explainApp } from "@/lib/hoot/app-map";
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
        "Open a page of the app for the member, now, without asking first: when they ask to go to, open, pull up or switch to a page, a team (sector), a holding, or a view (a period, a lookback, a trade to replay). Not for a question about a figure: answer that in the chat. The pages are those listed under THE APP in your instructions (team 'fund' is the Fund's own page; holding needs a ticker). View settings: performance takes a period (1d/7d/1m/6m/ytd/1y/itd, or custom with from/to), risk and exposure a lookback (6m/1y/2y), backtesting one trade to replay. Team is a slug, name or abbreviation (fig, tech, Healthcare, C&CS) or 'fund'; leave it out to stay in the scope the member is in. The member only gets pages they can already open; an error says why not. After it succeeds, say in one short sentence what you opened; don't research unless they also asked a question.",
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

    explain_app: tool({
      description:
        "How the Owl's Nest app works, from its own map: what a page shows and how to read it (except on a page whose own numbers WHAT THE MEMBER IS LOOKING AT says how to fetch: there, fetch them with that tool and explain those), who can open it, what a member can do there, where to find something, and what a term on a page means (active share, tracking error, allocation vs selection, the 400 bp rule, provisional…). Pass a page (a name like 'Exposure', a key like 'economic_calendar', or a path like '/t/fig/movements') and/or a term; with neither, it lists every page. Use it for questions about the app itself, not about markets or the Fund's numbers. App facts need no citation token; say they come from the app.",
      inputSchema: z.object({ page: z.string().max(120).optional(), term: z.string().max(80).optional() }),
      execute: async ({ page, term }): Promise<ToolResult<unknown>> => {
        const r = explainApp({ page, term, role: viewer.role });
        return r.error ? { data: null, sources: [], error: r.error } : { data: r, sources: [] };
      },
    }),

    set_theme: tool({
      description: "Switch the app to light mode, dark mode, or following the device ('system'), for this member, now. Use it whenever they ask to change the theme, colors or dark/light mode.",
      inputSchema: z.object({ theme: z.enum(["light", "dark", "system"]) }),
      execute: async ({ theme }): Promise<ToolResult<unknown>> => acted({ kind: "theme", theme }, theme === "system" ? "The app now follows the device's theme." : `${theme === "light" ? "Light" : "Dark"} mode is on.`),
    }),
  };
}
