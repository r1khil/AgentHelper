-- Acceptance evidence only. No credentials, session tokens, or recipient addresses.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH
h AS (SELECT id,team_id,ticker,security_id FROM holding WHERE security_id IN ('SYNTH:THC','SYNTH:DRAM')),
e AS (SELECT e.* FROM movement_event e JOIN h ON h.id=e.holding_id WHERE session='2026-09-10'),
i AS (SELECT i.id,i.event_id,i.team_id,i.owner_id,i.status,i.due_at,i.configuration_error,length(i.analyst_update) AS reasoning_length,md5(i.analyst_update) AS reasoning_hash,i.no_catalyst,i.completed_at,i.completed_by FROM investigation i JOIN e ON e.id=i.event_id),
s AS (SELECT s.id,s.holding_id,s.team_id,s.source_key,s.synthetic FROM source s JOIN h ON h.id=s.holding_id),
f AS (SELECT f.id,f.investigation_id,f.source_id,f.kind FROM evidence_fact f JOIN i ON i.id=f.investigation_id),
b AS (SELECT * FROM briefing WHERE team_id IN (SELECT team_id FROM h)),
j AS (SELECT id,job_key,kind,team_id,payload,status,run_at,attempts,last_error FROM job WHERE payload->>'investigationId' IN (SELECT id::text FROM i) OR payload->>'briefingId' IN (SELECT id::text FROM b)),
d AS (SELECT id,delivery_key,investigation_id,kind,status,jsonb_array_length(recipients) AS recipient_count,body LIKE 'SYNTHETIC DEVELOPMENT — email captured, not sent.%' AS synthetic_capture_marker,created_at FROM delivery WHERE investigation_id IN (SELECT id FROM i) OR delivery_key IN (SELECT job_key FROM j)),
o AS (SELECT id,security_id,session,value,previous_close,provider,quality FROM market_observation WHERE session='2026-09-10' AND security_id IN ('SYNTH:THC','SYNTH:DRAM','SPX'))
SELECT json_build_object(
'utc',now(),'holdings',(SELECT coalesce(json_agg(h ORDER BY id),'[]') FROM h),
'events',(SELECT coalesce(json_agg(e ORDER BY id),'[]') FROM e),
'investigations',(SELECT coalesce(json_agg(i ORDER BY id),'[]') FROM i),
'observations',(SELECT coalesce(json_agg(o ORDER BY id),'[]') FROM o),
'observation_consumers',(SELECT coalesce(json_agg(x),'[]') FROM (SELECT id,holding_id,holding_observation_id,benchmark_observation_id FROM movement_event WHERE holding_observation_id IN (SELECT id FROM o) OR benchmark_observation_id IN (SELECT id FROM o) ORDER BY id) x),
'sources',(SELECT coalesce(json_agg(s ORDER BY id),'[]') FROM s),
'evidence',(SELECT coalesce(json_agg(f ORDER BY id),'[]') FROM f),
'briefings',(SELECT coalesce(json_agg(b ORDER BY id),'[]') FROM b),
'briefing_items',(SELECT coalesce(json_agg(x ORDER BY item_key),'[]') FROM briefing_item x WHERE briefing_id IN (SELECT id FROM b)),
'jobs',(SELECT coalesce(json_agg(j ORDER BY id),'[]') FROM j),
'deliveries',(SELECT coalesce(json_agg(d ORDER BY id),'[]') FROM d),
'completion_sources',(SELECT coalesce(json_agg(x ORDER BY id),'[]') FROM completion_source x WHERE investigation_id IN (SELECT id FROM i)),
'feedback',(SELECT coalesce(json_agg(x ORDER BY id),'[]') FROM (SELECT id,investigation_id,result->>'mode' AS mode,created_at FROM reasoning_feedback WHERE investigation_id IN (SELECT id FROM i)) x),
'audit',(SELECT coalesce(json_agg(x ORDER BY created_at,id),'[]') FROM (SELECT id,action,target,created_at,details FROM audit_event WHERE target IN (SELECT id::text FROM i)) x),
'real_users',(SELECT count(*) FROM app_user WHERE subject NOT LIKE 'dev:%'),
'real_admins',(SELECT count(*) FROM app_user WHERE subject NOT LIKE 'dev:%' AND admin)
);
COMMIT;
