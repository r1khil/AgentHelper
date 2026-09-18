import { computeAttribution, computeTeamAttribution } from "@/lib/attribution/attribution";
import { buildSectorLineage } from "@/lib/attribution/lineage";
import { loadAttributionSeries, loadTeamSectors } from "@/lib/attribution/load";
import { GICS_SECTORS, type BucketKey } from "@/lib/attribution/sectors";
import { periodFromQuery } from "@/lib/attribution/view";
import { canManageTeam, getCurrentUser, transparencyEnabled } from "@/lib/auth";
import { getTeamBySlug } from "@/lib/teams";

export const dynamic = "force-dynamic";

const BUCKETS = new Set<string>([...GICS_SECTORS, "cash", "unclassified"]);

/** Round every number so the per-day table does not ship 17-digit floats. */
function compact(value: unknown) {
  return JSON.stringify(value, (_k, v) => (typeof v === "number" && Number.isFinite(v) ? Number(v.toPrecision(10)) : v));
}

/**
 * Transparency mode only: the per-day Brinson and Carino working behind one sector row, plus the
 * stored rows that fed it. Fetched lazily when a row is expanded because a year of days per sector
 * is a few hundred KB.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!transparencyEnabled(user)) return new Response("Transparency mode is off", { status: 403 });

  const url = new URL(req.url);
  const sector = url.searchParams.get("sector") ?? "";
  if (!BUCKETS.has(sector)) return new Response("Unknown sector", { status: 400 });
  const teamSlug = url.searchParams.get("team");
  const query = { period: url.searchParams.get("period") ?? undefined, from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined };

  const loaded = await loadAttributionSeries();
  if (!loaded.inception || !loaded.latest) return new Response("No attribution data", { status: 404 });
  const { period } = periodFromQuery(query, { inception: loaded.inception, latest: loaded.latest });

  let result;
  if (teamSlug) {
    const team = await getTeamBySlug(teamSlug);
    if (!team || !canManageTeam(user, team.id)) return new Response("Not found", { status: 404 });
    const sectors = (await loadTeamSectors()).get(team.id) ?? [];
    result = computeTeamAttribution(loaded.series, period, team.id, sectors, { breakdown: true });
  } else {
    result = computeAttribution(loaded.series, period, { breakdown: true });
  }
  const key = sector as BucketKey;
  const breakdown = result.breakdown!.sectors.find((s) => s.key === key) ?? null;
  const lineage = buildSectorLineage(
    { prices: loaded.inputs.prices, dividends: loaded.inputs.dividends, splits: loaded.inputs.splits, weightSets: loaded.weightSets, portfolio: loaded.series.portfolio, benchmark: loaded.series.benchmark },
    key,
    period,
    breakdown,
  );
  const row = result.sectors.find((s) => s.key === key) ?? null;
  return new Response(compact({ period: { start: period.start, end: period.end }, row, breakdown, linking: result.breakdown!.linking, lineage }), {
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}
