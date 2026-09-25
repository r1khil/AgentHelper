-- Retry the 5:15 p.m. brief email every 15 minutes until midnight New York time, instead of once at 00:05 UTC.
-- On 2026-09-24 the 5:15 send and that single 8:05 p.m. retry both failed (OpenMail answered 502) and nothing
-- tried again, so the brief never went out.
-- pg_cron speaks UTC: every 15 minutes 21:00-23:45 UTC Monday to Friday, then 00:00-04:45 UTC Tuesday to Saturday
-- (still the same New York evening). The retry route acts only from 5:25 p.m. to midnight New York time, in daylight
-- and standard time alike, and returns at once when the brief already went out. The ?at=17:15 job stays as it is,
-- and vercel.json adds one Vercel cron on the same route as a backstop in case pg_cron or pg_net stops.
-- cron.schedule with an existing job name replaces that job's schedule and command.
select cron.schedule('evening-brief-email-retry', '*/15 21-23 * * 1-5', $$select public.call_app_cron('/api/cron/daily-brief/retry')$$);
--> statement-breakpoint
select cron.schedule('evening-brief-email-retry-night', '*/15 0-4 * * 2-6', $$select public.call_app_cron('/api/cron/daily-brief/retry')$$);
