-- The Sunday weekly update, on New York time: build last Friday's pack and have Hoot email it to Aadi at 12:00.
-- pg_cron speaks UTC, so the job runs at noon's EDT hour (16 UTC) and its EST hour (17 UTC); the route's `?at=12:00`
-- check lets only the call that lands at noon New York through. vercel.json keeps one Vercel cron (19:00 UTC Sunday) as a
-- backstop; after the email has gone out it changes nothing.
-- Needs the Vault secrets `cron_secret` and `app_url` from 0017. cron.schedule with an existing name replaces that job.
select cron.schedule('weekly-update', '0 16,17 * * 0', $$select public.call_app_cron('/api/cron/weekly?at=12:00')$$);
