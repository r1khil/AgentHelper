import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { db } from "../db/client";
import { collectEvidence } from "./engine";
import { calendar } from "./fixtures";
export const MAX_ATTEMPTS = 3;
export async function claim(now = new Date()) {
  return await db().begin(async (tx) => {
    await tx`insert into job_attempt(job_id,attempt,outcome,error) select id,attempts,'lease_expired','Worker lease expired' from job where status='running' and lease_until<${now}`;
    await tx`update job set status='failed',last_error='Lease expired after final attempt',lease_token=null where status='running' and lease_until<${now} and attempts>=${MAX_ATTEMPTS}`;
    const [job] =
      await tx`select * from job where ((status='pending' and run_at<=${now}) or (status='running' and lease_until<${now})) and attempts<${MAX_ATTEMPTS} order by run_at,id for update skip locked limit 1`;
    if (!job) return null;
    const token = randomUUID();
    const [r] =
      await tx`update job set status='running',attempts=attempts+1,lease_token=${token},lease_until=${new Date(now.getTime() + 120000)} where id=${job.id} returning *`;
    return r;
  });
}
async function deliver(job: NonNullable<Awaited<ReturnType<typeof claim>>>) {
  await db().begin(async (tx) => {
    const id = job.payload.investigationId;
    let subject = "",
      body = "",
      recipients: string[] = [];
    if (id) {
      const [i] =
        await tx`select i.*,e.session,e.holding_return,e.spx_return,e.relative_move,h.ticker,o.observed_at from investigation i join movement_event e on e.id=i.event_id join holding h on h.id=e.holding_id join market_observation o on o.id=e.holding_observation_id where i.id=${id} for update of i`;
      if (!i) throw Error("Investigation missing");
      const [lease] =
        await tx`select id from job where id=${job.id} and lease_token=${job.lease_token} and status='running' for update`;
      if (!lease) return;
      if (i.team_id !== job.team_id) throw Error("Job team mismatch");
      if (
        ["reminder", "overdue"].includes(job.kind) &&
        i.status === "completed"
      )
        return;
      const people =
        job.kind === "alert"
          ? await tx`select u.email from membership m join app_user u on u.id=m.user_id where m.team_id=${i.team_id}`
          : await tx`select distinct u.email from app_user u left join membership m on m.user_id=u.id and m.team_id=${i.team_id} where u.id=${i.owner_id} or (m.role='lead' and m.team_id=${i.team_id})`;
      recipients = people.map((p) => p.email);
      if (!recipients.length) throw Error("No recipients configured");
      subject = `${job.kind === "alert" ? "Closing movement" : job.kind === "reminder" ? "Update reminder" : "Overdue update"} · ${i.ticker}`;
      body = `SYNTHETIC DEVELOPMENT — email captured, not sent.\n${i.ticker}: ${i.holding_return}% | SPX: ${i.spx_return}% | Difference: ${i.relative_move} pp.\nOfficial closing observation: ${DateTime.fromJSDate(i.observed_at).setZone("America/New_York").toISO()} (America/New_York).\nDue: ${i.due_at ? DateTime.fromJSDate(i.due_at).setZone("America/New_York").toISO() : "Configuration missing"}.\n/investigations/${id}`;
    } else {
      const [lease] =
        await tx`select id from job where id=${job.id} and lease_token=${job.lease_token} and status='running' for update`;
      if (!lease) return;
      const [b] =
        await tx`select * from briefing where id=${job.payload.briefingId} and team_id=${job.team_id}`;
      if (!b) throw Error("Briefing missing");
      const people =
        await tx`select u.email from membership m join app_user u on u.id=m.user_id where m.team_id=${job.team_id}`;
      recipients = people.map((p) => p.email);
      if (!recipients.length) throw Error("No recipients configured");
      subject = `Daily evidence briefing · ${b.day}`;
      body = `SYNTHETIC DEVELOPMENT — email captured, not sent.\n${b.source_ids.length} source(s), ${b.event_ids.length} movement(s).\n/briefings/${b.id}`;
    }
    await tx`insert into delivery(delivery_key,team_id,investigation_id,kind,recipients,subject,body) values(${job.job_key},${job.team_id},${id ?? null},${job.kind},${tx.json(recipients)},${subject},${body}) on conflict(delivery_key) do nothing`;
  });
}
export async function runJob(
  job: NonNullable<Awaited<ReturnType<typeof claim>>>,
) {
  try {
    if (job.kind === "evidence")
      await collectEvidence(job.payload.investigationId);
    else await deliver(job);
    await db().begin(async (tx) => {
      const [r] =
        await tx`update job set status='done',lease_token=null,lease_until=null where id=${job.id} and lease_token=${job.lease_token} returning id`;
      if (r)
        await tx`insert into job_attempt(job_id,attempt,outcome) values(${job.id},${job.attempts},'succeeded')`;
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Worker failure";
    await db().begin(async (tx) => {
      const [r] =
        await tx`update job set status=${job.attempts >= MAX_ATTEMPTS ? "failed" : "pending"},run_at=${new Date(Date.now() + Math.pow(2, job.attempts) * 60000)},last_error=${message.slice(0, 500)},lease_token=null,lease_until=null where id=${job.id} and lease_token=${job.lease_token} returning id`;
      if (r)
        await tx`insert into job_attempt(job_id,attempt,outcome,error) values(${job.id},${job.attempts},'failed',${message.slice(0, 500)})`;
    });
  }
}
export async function drain(limit = 30, now = new Date()) {
  let count = 0;
  while (count < limit) {
    const job = await claim(now);
    if (!job) break;
    await runJob(job);
    count++;
  }
  return count;
}
export async function makeBriefings(day: string) {
  if (!calendar.session(day)) return 0;
  let count = 0;
  for (const team of await db()`select id from team`) {
    const created = await db().begin(async (tx) => {
      await tx`select id from team where id=${team.id} for update`;
      if (
        (
          await tx`select id from briefing where team_id=${team.id} and day=${day}`
        ).length
      )
        return false;
      const start = DateTime.fromISO(day, { zone: "America/New_York" }).set({
        hour: 8,
      });
      const since = start.minus({ days: 1 }).toJSDate();
      const until = start.toJSDate();
      const sources =
        await tx`select s.id from source s where s.team_id=${team.id} and ((s.category in ('announcement','filing','sector','constituent') and s.published_at>${since} and s.published_at<=${until}) or (s.category='catalyst' and s.catalyst_at>=${until} and s.catalyst_at<=${start.plus({ days: 7 }).toJSDate()} and s.published_at<=${until})) and not exists(select 1 from briefing_item bi where bi.item_key='source:'||s.id::text)`;
      const events =
        await tx`select e.id from movement_event e where e.team_id=${team.id} and e.session<${day} and e.session>=${start.minus({ days: 4 }).toISODate()!} and not exists(select 1 from briefing_item bi where bi.item_key='event:'||e.id::text)`;
      if (!sources.length && !events.length) return false;
      const [b] =
        await tx`insert into briefing(team_id,day,source_ids,event_ids) values(${team.id},${day},${tx.json(sources.map((s) => s.id))},${tx.json(events.map((e) => e.id))}) returning id`;
      for (const [prefix, rows] of [
        ["source", sources],
        ["event", events],
      ] as const)
        for (const r of rows)
          await tx`insert into briefing_item(item_key,briefing_id) values(${prefix + ":" + r.id},${b.id})`;
      await tx`insert into job(job_key,kind,team_id,payload) values(${"briefing:" + b.id},'briefing',${team.id},${tx.json({ briefingId: b.id })})`;
      return true;
    });
    if (created) count++;
  }
  return count;
}
