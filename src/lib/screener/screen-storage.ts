import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { JsonStore } from "./screen-job";

/** The private Storage bucket holding each screen run's working sets (drizzle/0028_screener.sql). */
export const SCREENER_BUCKET = "screener";

/** JSON objects in the screener bucket, through the service-role client. */
export function screenerStore(): JsonStore {
  const bucket = () => createSupabaseAdmin().storage.from(SCREENER_BUCKET);
  return {
    async put(path, value) {
      const body = Buffer.from(JSON.stringify(value));
      const { error } = await bucket().upload(path, body, { contentType: "application/json", upsert: true });
      if (error) throw new Error(`Screener upload failed (${path}): ${error.message}`);
    },
    async get<T>(path: string) {
      const { data, error } = await bucket().download(path);
      if (error || !data) return null;
      return JSON.parse(await data.text()) as T;
    },
    async list(prefix) {
      const out: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await bucket().list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
        if (error) throw new Error(`Screener list failed (${prefix}): ${error.message}`);
        for (const f of data ?? []) if (f.id) out.push(`${prefix}/${f.name}`);
        if (!data || data.length < 1000) break;
      }
      return out;
    },
    async remove(paths) {
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await bucket().remove(paths.slice(i, i + 100));
        if (error) throw new Error(`Screener cleanup failed: ${error.message}`);
      }
    },
  };
}
