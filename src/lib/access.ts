import { db } from "../db/client";
export type Actor = { id: string; name: string; email: string; admin: boolean };
export class AccessError extends Error {
  constructor() {
    super("This record is unavailable or you do not have access.");
  }
}
export async function assertTeam(actor: Actor, teamId: string) {
  if (actor.admin) return;
  const rows =
    await db()`select 1 from membership where user_id=${actor.id} and team_id=${teamId}`;
  if (!rows.length) throw new AccessError();
}
export function assertAdmin(actor: Actor) {
  if (!actor.admin) throw new AccessError();
}
export async function assertLead(actor: Actor, teamId: string) {
  if (actor.admin) return;
  const r =
    await db()`select 1 from membership where user_id=${actor.id} and team_id=${teamId} and role='lead'`;
  if (!r.length) throw new AccessError();
}
export async function getInvestigation(actor: Actor, id: string) {
  const [r] =
    await db()`select i.*, h.ticker,h.kind,h.id as holding_id,e.session,e.holding_return,e.spx_return,e.relative_move,e.policy_version,e.holding_observation_id,e.benchmark_observation_id,u.name as owner_name from investigation i join movement_event e on e.id=i.event_id join holding h on h.id=e.holding_id left join app_user u on u.id=i.owner_id where i.id=${id}`;
  if (!r) throw new AccessError();
  await assertTeam(actor, r.team_id);
  return r;
}
export async function getSource(actor: Actor, id: string) {
  const [r] = await db()`select * from source where id=${id}`;
  if (!r) throw new AccessError();
  await assertTeam(actor, r.team_id);
  return r;
}
