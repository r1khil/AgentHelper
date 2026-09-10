import { closeDb } from "../src/db/client";
import { seed } from "../src/lib/seed";
try {
  await seed();
  console.log(
    "Synthetic teams, identities and holdings seeded. No external messages sent.",
  );
} finally {
  await closeDb();
}
