import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { db } from "../db/client";
import {
  type Actor,
  assertTeam,
  assertLead,
  getInvestigation,
  AccessError,
} from "./access";
import { fixtureModel } from "./fixtures";
import { feedbackSchema } from "./contracts";
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const text = z.string().trim().min(1).max(10000);
export async function saveHolding(
  actor: Actor,
  input: {
    teamId: string;
    id?: string;
    ticker: string;
    kind: string;
    ownerId: string | null;
    peers: string;
    priorUpdates: string;
    questions: string;
  },
) {
  await assertTeam(actor, input.teamId);
  const ticker = z
    .string()
    .trim()
    .regex(/^[A-Z0-9.-]{1,12}$/)
    .parse(input.ticker);
  z.enum(["stock", "etf"]).parse(input.kind);
  for (const s of [input.peers, input.priorUpdates, input.questions])
    z.string().max(10000).parse(s);
  if (input.ownerId) {
    const [m] =
      await db()`select 1 from membership where team_id=${input.teamId} and user_id=${input.ownerId}`;
    if (!m) throw Error("Owner must belong to this team");
  }
  await db().begin(async (tx) => {
    let id = input.id;
    if (id) {
      const [r] =
        await tx`update holding set ticker=${ticker},kind=${input.kind},owner_id=${input.ownerId},peers=${input.peers},prior_updates=${input.priorUpdates},questions=${input.questions} where id=${id} and team_id=${input.teamId} returning id`;
      if (!r) throw new AccessError();
    } else {
      const [r] =
        await tx`insert into holding(team_id,security_id,ticker,kind,owner_id,peers,prior_updates,questions,effective_from) values(${input.teamId},${"SYNTH:" + ticker},${ticker},${input.kind},${input.ownerId},${input.peers},${input.priorUpdates},${input.questions},'2026-09-01') returning id`;
      id = r.id;
    }
    await tx`insert into audit_event(team_id,actor_id,action,target,details) values(${input.teamId},${actor.id},'holding.saved',${id!},${tx.json({ ticker })})`;
  });
}
export async function proposeThesis(
  actor: Actor,
  holdingId: string,
  content: string,
) {
  text.parse(content);
  const [h] = await db()`select * from holding where id=${holdingId}`;
  if (!h) throw new AccessError();
  await assertTeam(actor, h.team_id);
  await db().begin(async (tx) => {
    const [t] =
      await tx`insert into thesis(holding_id,content,author_id) values(${holdingId},${content},${actor.id}) returning id`;
    await tx`insert into audit_event(team_id,actor_id,action,target,details) values(${h.team_id},${actor.id},'thesis.proposed',${t.id},'{}')`;
  });
}
export async function approveThesis(actor: Actor, id: string) {
  const [t] =
    await db()`select t.*,h.team_id from thesis t join holding h on h.id=t.holding_id where t.id=${id}`;
  if (!t) throw new AccessError();
  await assertTeam(actor, t.team_id);
  await db().begin(async (tx) => {
    await tx`update thesis set approved_by=${actor.id},approved_at=now() where id=${id} and approved_at is null`;
    await tx`insert into audit_event(team_id,actor_id,action,target,details) values(${t.team_id},${actor.id},'thesis.approved',${id},'{}')`;
  });
}
export async function saveReasoning(
  actor: Actor,
  id: string,
  reasoning: string,
  noCatalyst: boolean,
) {
  text.parse(reasoning);
  const i = await getInvestigation(actor, id);
  await db().begin(async (tx) => {
    const [r] =
      await tx`update investigation set analyst_update=${reasoning},no_catalyst=${noCatalyst},status='in_progress' where id=${id} and status<>'completed' returning id`;
    if (!r) throw Error("Completed updates are immutable");
    await tx`insert into audit_event(team_id,actor_id,action,target,details) values(${i.team_id},${actor.id},'reasoning.saved',${id},'{}')`;
  });
}
export async function reviewReasoning(actor: Actor, id: string) {
  const i = await getInvestigation(actor, id);
  text.parse(i.analyst_update);
  const sources =
    await db()`select distinct s.id from source s join evidence_fact f on f.source_id=s.id where f.investigation_id=${id} and s.team_id=${i.team_id}`;
  const [thesis] =
    await db()`select content from thesis where holding_id=${i.holding_id} and approved_at is not null order by approved_at desc limit 1`;
  const ids = sources.map((s) => s.id as string);
  const result = feedbackSchema.parse(
    await fixtureModel.review(i.analyst_update, ids, thesis?.content ?? null),
  );
  if (result.sourceIds.some((x) => !ids.includes(x)))
    throw Error("Feedback contains an unsupported citation");
  await db()`insert into reasoning_feedback(investigation_id,author_id,reasoning,result) values(${id},${actor.id},${i.analyst_update},${db().json(result)})`;
}
export async function addNote(actor: Actor, id: string, content: string) {
  text.parse(content);
  await getInvestigation(actor, id);
  await db()`insert into analyst_note(investigation_id,author_id,content) values(${id},${actor.id},${content})`;
}
export async function complete(actor: Actor, id: string, sourceIds: string[]) {
  const i = await getInvestigation(actor, id);
  const ids = z
    .array(z.string().uuid())
    .min(1)
    .max(20)
    .parse([...new Set(sourceIds)]);
  await db().begin(async (tx) => {
    const [locked] =
      await tx`select * from investigation where id=${id} for update`;
    if (locked.status === "completed") return;
    text.parse(locked.analyst_update);
    const evidence =
      await tx`select distinct s.id from source s join evidence_fact f on f.source_id=s.id where f.investigation_id=${id} and s.team_id=${i.team_id} and s.id in ${tx(ids)}`;
    if (evidence.length !== ids.length)
      throw Error(
        "Completion sources must be evidence from this investigation",
      );
    for (const sid of ids)
      await tx`insert into completion_source(investigation_id,source_id) values(${id},${sid}) on conflict do nothing`;
    await tx`update investigation set status='completed',completed_by=${actor.id},completed_at=now() where id=${id}`;
    await tx`update job set status='cancelled',lease_token=null,lease_until=null where payload->>'investigationId'=${id} and kind in ('reminder','overdue') and status in ('pending','running')`;
    await tx`insert into audit_event(team_id,actor_id,action,target,details) values(${i.team_id},${actor.id},'investigation.completed',${id},${tx.json({ sourceIds: ids })})`;
  });
}
export async function evaluate(
  actor: Actor,
  id: string,
  minutes: number,
  sourceTracing: number,
  reasoning: number,
  comment: string,
) {
  await getInvestigation(actor, id);
  z.number().int().min(0).max(1440).parse(minutes);
  for (const n of [sourceTracing, reasoning])
    z.number().int().min(1).max(5).parse(n);
  z.string().max(2000).parse(comment);
  await db()`insert into evaluation(investigation_id,author_id,minutes,source_tracing,reasoning,comment) values(${id},${actor.id},${minutes},${sourceTracing},${reasoning},${comment})`;
}
export async function createInvitation(
  actor: Actor,
  teamId: string,
  email: string,
  role: string,
) {
  await assertLead(actor, teamId);
  z.email().parse(email);
  z.enum(["member", "lead"]).parse(role);
  const token = randomBytes(32).toString("base64url");
  await db()`insert into invitation(team_id,email,role,token_hash,expires_at) values(${teamId},${email.toLowerCase()},${role},${hash(token)},now()+interval '7 days')`;
  return token;
}
export async function acceptInvitation(actor: Actor, token: string) {
  z.string().min(40).max(100).parse(token);
  await db().begin(async (tx) => {
    const [inv] =
      await tx`select * from invitation where token_hash=${hash(token)} and expires_at>now() and accepted_at is null for update`;
    if (!inv)
      throw Error("Invitation is invalid, expired, or already accepted");
    await tx`insert into membership(team_id,user_id,role) values(${inv.team_id},${actor.id},${inv.role}) on conflict (team_id,user_id) do nothing`;
    await tx`update invitation set accepted_by=${actor.id},accepted_at=now() where id=${inv.id}`;
    await tx`insert into audit_event(team_id,actor_id,action,target,details) values(${inv.team_id},${actor.id},'invitation.accepted',${inv.id},'{}')`;
  });
}
