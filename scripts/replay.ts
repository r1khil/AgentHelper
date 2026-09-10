import { db, closeDb } from "../src/db/client";
import { replay } from "../src/lib/engine";
import { drain, makeBriefings } from "../src/lib/jobs";
import { IDS } from "../src/lib/seed";
try {
  const [a] = await db()`select * from app_user where id=${IDS.admin}`;
  console.log(
    await replay({ id: a.id, name: a.name, email: a.email, admin: a.admin }),
  );
  await drain();
  await makeBriefings("2026-09-11");
  await drain();
  console.log("Replay finished. All deliveries captured; nothing sent.");
} finally {
  await closeDb();
}
