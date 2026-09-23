-- Second try at the 5:15 p.m. brief email, just after OpenMail's daily quotas reset at midnight UTC.
-- A new OpenMail inbox may send only 20 "cold" emails a day (to addresses that have never written to it),
-- counted per recipient per UTC day. That day starts at 8 p.m. New York time, so evening test sends and
-- Hoot's replies use up the next day's 5:15 allowance, and the send fails with a 429.
-- 00:05 UTC Tuesday to Saturday is 8:05 p.m. (EDT) or 7:05 p.m. (EST) on the same New York weekday, so
-- the route picks the same session date. It sends only when that session's brief has not gone out yet.
select cron.schedule('evening-brief-email-retry', '5 0 * * 2-6', $$select public.call_app_cron('/api/cron/daily-brief/send')$$);
