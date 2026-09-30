-- Movement write-ups are gone (docs/decisions.md, 2026-09-29), so the 5:00 pm close check that opened them stops.
-- The evening prices job (evening-prices) keeps storing official closes. The movements tables and their rows stay.
select cron.unschedule('evening-close') where exists (select 1 from cron.job where jobname = 'evening-close');
