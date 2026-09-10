import { db } from "../db/client";
import { assertAdmin, type Actor } from "./access";
import { calculate, deadline, POLICY, QualityError } from "./movement";
import {
  calendar,
  observation,
  FIXTURE_DAY,
  fixtureEvidence,
} from "./fixtures";
import type { Observation, CalendarAdapter } from "./contracts";
export async function ingest(
  holdingId: string,
  day: string,
  holding: Observation | null,
  benchmark: Observation | null,
  cal: CalendarAdapter = calendar,
) {
  const [h] = await db()`select * from holding where id=${holdingId}`;
  if (!h) throw Error("Holding does not exist");
  let result;
  try {
    if (day < h.effective_from || (h.effective_to && day > h.effective_to))
      throw new QualityError("Holding is not effective for this session");
    if (holding?.securityId !== h.security_id)
      throw new QualityError("Observation security does not match holding");
    result = calculate(holding, benchmark, cal.session(day));
  } catch (e) {
    if (!(e instanceof QualityError)) throw e;
    await db()`insert into quality_failure(team_id,holding_id,session,message) values(${h.team_id},${holdingId},${day},${e.message}) on conflict(holding_id,session) do update set message=excluded.message,resolved_at=null`;
    return { qualityError: e.message };
  }
  return await db().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${holdingId + ":" + day},0))`;
    const [prior] =
      await tx`select i.id from investigation i join movement_event e on e.id=i.event_id where e.holding_id=${holdingId} and e.session=${day}`;
    if (prior) return { qualifies: true, id: prior.id, duplicate: true };
    await tx`insert into fund_policy(version,config) values(${POLICY.version},${tx.json(POLICY)}) on conflict do nothing`;
    const ids: string[] = [];
    for (const o of [holding!, benchmark!]) {
      const [row] =
        await tx`insert into market_observation(security_id,session,value,previous_close,observed_at,provider,quality,raw) values(${o.securityId},${day},${o.value},${o.previousClose},${o.observedAt},${o.provider},'valid',${tx.json(o)}) returning id`;
      ids.push(row.id);
    }
    await tx`update quality_failure set resolved_at=now() where holding_id=${holdingId} and session=${day}`;
    if (!result.qualifies) return { qualifies: false };
    const [event] =
      await tx`insert into movement_event(team_id,holding_id,session,holding_observation_id,benchmark_observation_id,holding_return,spx_return,relative_move,policy_version) values(${h.team_id},${holdingId},${day},${ids[0]},${ids[1]},${result.holdingReturn},${result.spxReturn},${result.relativeMove},${POLICY.version}) on conflict(team_id,holding_id,session,event_type) do nothing returning id`;
    if (!event) {
      const [existing] =
        await tx`select i.id from investigation i join movement_event e on e.id=i.event_id where e.holding_id=${holdingId} and e.session=${day}`;
      return { qualifies: true, id: existing.id, duplicate: true };
    }
    const [lead] =
      await tx`select user_id from membership where team_id=${h.team_id} and role='lead' order by id limit 1`;
    let owner = h.owner_id;
    if (owner) {
      const [member] =
        await tx`select 1 from membership where team_id=${h.team_id} and user_id=${owner}`;
      if (!member) owner = null;
    }
    owner ??= lead?.user_id ?? null;
    let due: Date | null = null,
      reminder: Date | null = null;
    const errors: string[] = [];
    if (!owner) errors.push("No holding owner or team lead configured");
    try {
      const d = deadline(day, cal);
      due = d.due;
      reminder = d.reminder;
    } catch (e) {
      errors.push((e as Error).message);
    }
    const [inv] =
      await tx`insert into investigation(event_id,team_id,owner_id,due_at,configuration_error) values(${event.id},${h.team_id},${owner},${due},${errors.join("; ") || null}) returning id`;
    for (const [kind, runAt] of [
      ["alert", new Date()],
      ["evidence", new Date()],
      ["reminder", reminder],
      ["overdue", due],
    ] as const) {
      if (!runAt) continue;
      await tx`insert into job(job_key,kind,team_id,payload,run_at) values(${kind + ":" + inv.id},${kind},${h.team_id},${tx.json({ investigationId: inv.id })},${runAt}) on conflict do nothing`;
    }
    return { qualifies: true, id: inv.id, duplicate: false };
  });
}
export async function collectEvidence(id: string) {
  await db().begin(async (tx) => {
    const [i] =
      await tx`select i.team_id,e.session,h.id as holding_id,h.ticker from investigation i join movement_event e on e.id=i.event_id join holding h on h.id=e.holding_id where i.id=${id}`;
    if (!i) throw Error("Investigation not found");
    if (!["THC", "DRAM"].includes(i.ticker)) return;
    for (const doc of fixtureEvidence(i.ticker)) {
      const [s] =
        await tx`insert into source(team_id,holding_id,source_key,title,publisher,published_at,location,content,category,catalyst_at) values(${i.team_id},${i.holding_id},${doc.key},${doc.title},${doc.publisher},${doc.publishedAt},${doc.location},${doc.content},${doc.category},${doc.catalystAt ?? null}) on conflict(team_id,source_key) do update set source_key=excluded.source_key returning id`;
      for (const [kind, content] of [
        ["fact", doc.fact],
        ["hypothesis", doc.hypothesis],
      ] as const) {
        if (content)
          await tx`insert into evidence_fact(investigation_id,source_id,kind,content,location) values(${id},${s.id},${kind},${content},${doc.location}) on conflict do nothing`;
      }
    }
  });
}
export async function replay(actor: Actor) {
  assertAdmin(actor);
  return replayFixtures();
}
// Operator/worker entry point; never expose without the actor-checked replay above.
export async function replayFixtures() {
  const holdings =
    await db()`select id,ticker,security_id from holding where security_id in ('SYNTH:THC','SYNTH:DRAM')`;
  const result = [];
  for (const h of holdings)
    result.push(
      await ingest(
        h.id,
        FIXTURE_DAY,
        observation(h.security_id, h.ticker === "THC" ? "105.1" : "96.5"),
        observation("SPX", "100.8"),
      ),
    );
  return result;
}
