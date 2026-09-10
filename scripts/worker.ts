import { closeDb } from "../src/db/client";
import { drain, makeBriefings } from "../src/lib/jobs";
import { DateTime } from "luxon";
import { replayFixtures } from "../src/lib/engine";
import { calendar, FIXTURE_DAY } from "../src/lib/fixtures";
try {
  const now = DateTime.now().setZone("America/New_York");
  // Only the bounded fixture session exists; repeated schedules are idempotent.
  // Do not manufacture daily observations outside the fixture calendar.
  const fixtureClose = DateTime.fromISO(calendar.session(FIXTURE_DAY)!.close);
  if (now >= fixtureClose) await replayFixtures();
  if (now.hour >= 8) await makeBriefings(now.toISODate()!);
  console.log({ processed: await drain(30) });
} finally {
  await closeDb();
}
