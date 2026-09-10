import { z } from "zod";
import { db, closeDb } from "../src/db/client";
import { hash } from "../src/lib/service";
import { randomBytes } from "node:crypto";
const [command, value, teamId] = process.argv.slice(2);
try {
  if (command === "admin") {
    z.string().uuid().parse(value);
    const [u] = await db()`select * from app_user where id=${value}`;
    if (!u || u.subject.startsWith("dev:"))
      throw Error("User must first sign in with Entra");
    await db().begin(async (tx) => {
      await tx`update app_user set admin=true where id=${value}`;
      await tx`insert into audit_event(actor_id,action,target,details) values(${value},'admin.bootstrap',${value},'{}')`;
    });
    console.log("Administrator granted to authenticated user ID.");
  } else if (command === "invite") {
    z.email().parse(value);
    z.string().uuid().parse(teamId);
    const token = randomBytes(32).toString("base64url");
    await db()`insert into invitation(team_id,email,role,token_hash,expires_at) values(${teamId},${value},'member',${hash(token)},now()+interval '7 days')`;
    console.log(token);
  } else if (command === "users") {
    console.log(
      await db()`select id,name,email from app_user where subject not like 'dev:%'`,
    );
  } else
    throw Error(
      "Usage: bootstrap.ts users | admin USER_UUID | invite EMAIL TEAM_UUID",
    );
} finally {
  await closeDb();
}
