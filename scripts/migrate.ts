import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, closeDb } from "../src/db/client";
try {
  await migrate(drizzle(db()), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
} finally {
  await closeDb();
}
