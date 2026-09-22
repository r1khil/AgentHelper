-- Weekday evening pipeline, on New York time, run by Supabase pg_cron (Vercel Hobby crons fire anywhere
-- within their hour, too loose for 5:00 / 5:05 / 5:15).
--   17:00  prices (attribution closes) and the close check (daily moves / movement alerts)
--   17:05  Hoot analyzes the day's attribution
--   17:15  Hoot's brief is emailed to Aadi, Saad, Rikhil and Max
-- pg_cron speaks UTC, so each job is scheduled at its EDT hour (21 UTC) and its EST hour (22 UTC);
-- the app's `?at=` check runs only the call that lands on the New York slot.
-- Needs the Vault secrets `cron_secret` (the app's CRON_SECRET) and `app_url`: npx tsx scripts/set-cron-secrets.ts
create extension if not exists pg_cron;
--> statement-breakpoint
create extension if not exists pg_net;
--> statement-breakpoint
create or replace function public.call_app_cron(path text) returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    timeout_milliseconds := 300000
  );
$$;
--> statement-breakpoint
revoke all on function public.call_app_cron(text) from public, anon, authenticated;
--> statement-breakpoint
select cron.schedule('evening-prices', '0 21,22 * * 1-5', $$select public.call_app_cron('/api/cron/prices?at=17:00')$$);
--> statement-breakpoint
select cron.schedule('evening-close', '0 21,22 * * 1-5', $$select public.call_app_cron('/api/cron/close?at=17:00')$$);
--> statement-breakpoint
select cron.schedule('evening-brief', '5 21,22 * * 1-5', $$select public.call_app_cron('/api/cron/daily-brief?at=17:05')$$);
--> statement-breakpoint
select cron.schedule('evening-brief-email', '15 21,22 * * 1-5', $$select public.call_app_cron('/api/cron/daily-brief/send?at=17:15')$$);
