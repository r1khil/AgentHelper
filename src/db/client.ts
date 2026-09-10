import postgres from "postgres";
let client: ReturnType<typeof postgres> | undefined;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return (client ??= postgres(process.env.DATABASE_URL, {
    max: 3,
    idle_timeout: 15,
    connect_timeout: 15,
    prepare: false,
    onnotice: () => {},
  }));
}
export async function closeDb() {
  if (client) {
    await client.end();
    client = undefined;
  }
}
export type Tx = postgres.TransactionSql;
