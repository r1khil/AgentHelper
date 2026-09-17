import "server-only";
import { cache } from "react";
import { db } from "@/db/client";
import { teamSectors } from "@/db/schema";
import type { GicsSector } from "./sectors";
import { loadSeries } from "./store";

/** Per-request: the fund and team pages both build on the same replayed series. */
export const loadAttributionSeries = cache(async () => {
  const started = Date.now();
  const loaded = await loadSeries(db);
  console.log(`[attribution] series ${loaded.series.portfolio.length}d in ${Date.now() - started}ms`);
  return loaded;
});

export const loadTeamSectors = cache(async (): Promise<Map<string, GicsSector[]>> => {
  const rows = await db.select().from(teamSectors);
  const out = new Map<string, GicsSector[]>();
  for (const r of rows) out.set(r.teamId, [...(out.get(r.teamId) ?? []), r.sector]);
  return out;
});
