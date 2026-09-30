import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/** How far back Admin's Usage tab looks. The table keeps 90 days. */
export const USAGE_WINDOW_DAYS = 30;

export type UsageReport = {
  days: number;
  active: { today: number; week: number; month: number };
  members: { id: string; name: string; lastSeen: string | null; activeDays: number; views: number; hootAsks: number; topRoute: string | null }[];
  pages: { route: string; views: number; members: number; medianSec: number | null; p75LcpMs: number | null }[];
  actions: { name: string; detail: string; count: number; members: number }[];
  errors: { message: string; route: string | null; count: number; members: number; last: string }[];
};

/**
 * Admin's Usage tab: who is using the app and how, from production usage_events over the last 30 days. Local runs
 * against the same database are left out. Null when the table can't be read (not migrated yet).
 */
export async function loadUsageReport(q: Pick<typeof db, "execute"> = db): Promise<UsageReport | null> {
  const since = sql`now() - make_interval(days => ${USAGE_WINDOW_DAYS})`;
  const base = sql`env = 'production' and at >= ${since}`;
  try {
    const [active, members, pages, actions, errors] = await Promise.all([
      q.execute<{ today: number; week: number; month: number }>(sql`
        select count(distinct user_id) filter (where (at at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date)::int as today,
               count(distinct user_id) filter (where at >= now() - interval '7 days')::int as week,
               count(distinct user_id)::int as month
        from usage_events where ${base}`),
      q.execute<{ id: string; name: string; last_seen: string | null; active_days: number; views: number; hoot_asks: number; top_route: string | null }>(sql`
        with e as (select * from usage_events where ${base})
        select p.id, p.full_name as name,
               (select max(at) from e where e.user_id = p.id)::text as last_seen,
               (select count(distinct (at at time zone 'America/New_York')::date) from e where e.user_id = p.id)::int as active_days,
               (select count(*) from e where e.user_id = p.id and name = 'page_view')::int as views,
               (select count(*) from e where e.user_id = p.id and name = 'hoot_ask')::int as hoot_asks,
               (select route from e where e.user_id = p.id and name = 'page_view' group by route order by count(*) desc limit 1) as top_route
        from profiles p
        order by active_days desc, views desc, p.full_name`),
      q.execute<{ route: string; views: number; members: number; median_sec: number | null; p75_lcp_ms: number | null }>(sql`
        select route, count(*)::int as views, count(distinct user_id)::int as members,
               round((percentile_cont(0.5) within group (order by (props->>'ms')::float8) / 1000)::numeric)::float8 as median_sec,
               round(percentile_cont(0.75) within group (order by (props->'vitals'->>'LCP')::float8)::numeric)::float8 as p75_lcp_ms
        from usage_events where ${base} and name = 'page_view' and route is not null
        group by route order by views desc limit 40`),
      q.execute<{ name: string; detail: string; count: number; members: number }>(sql`
        select name, coalesce(props->>'label', props->>'kind', props->>'mode' || coalesce(' · ' || (props->>'via'), ''),
                              case when name = 'sidebar_toggle' then (case when props->>'collapsed' = 'true' then 'hidden' else 'shown' end) end,
                              case when name = 'hoot_ask' then (case when props->>'holding' = 'true' then 'about a holding' when props->>'fund' = 'true' then 'whole fund' else 'team' end) end,
                              '') as detail,
               count(*)::int as count, count(distinct user_id)::int as members
        from usage_events where ${base} and name not in ('page_view', 'client_error')
        group by 1, 2 order by count desc limit 40`),
      q.execute<{ message: string; route: string | null; count: number; members: number; last: string }>(sql`
        select props->>'message' as message, max(route) as route, count(*)::int as count, count(distinct user_id)::int as members, max(at)::text as last
        from usage_events where ${base} and name = 'client_error'
        group by 1 order by max(at) desc limit 20`),
    ]);
    const a = active[0] ?? { today: 0, week: 0, month: 0 };
    return {
      days: USAGE_WINDOW_DAYS,
      active: { today: a.today, week: a.week, month: a.month },
      members: members.map((m) => ({ id: m.id, name: m.name, lastSeen: m.last_seen ? new Date(m.last_seen).toISOString() : null, activeDays: m.active_days, views: m.views, hootAsks: m.hoot_asks, topRoute: m.top_route })),
      pages: pages.map((p) => ({ route: p.route, views: p.views, members: p.members, medianSec: p.median_sec, p75LcpMs: p.p75_lcp_ms })),
      actions: actions.map((r) => ({ ...r })),
      errors: errors.map((e) => ({ message: e.message ?? "Error", route: e.route, count: e.count, members: e.members, last: new Date(e.last).toISOString() })),
    };
  } catch (e) {
    console.warn(`[usage] report unavailable: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
