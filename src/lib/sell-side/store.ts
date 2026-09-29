import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { sellSideCalls, sellSideParts } from "@/db/schema";
import { transcriptSource } from "./types";
import { inTeams, type TeamIds } from "@/lib/team-filter";

export async function getCall(id: string) {
  const [call] = await db.select().from(sellSideCalls).where(eq(sellSideCalls.id, id)).limit(1);
  return call ?? null;
}
export async function callParts(id: string) {
  return db.select().from(sellSideParts).where(eq(sellSideParts.callId, id)).orderBy(asc(sellSideParts.seq));
}
export async function listCalls(teamId: TeamIds) {
  return db.select().from(sellSideCalls).where(inTeams(sellSideCalls.teamId, teamId)).orderBy(desc(sellSideCalls.createdAt)).limit(100);
}
/** `teamId` null: a fund-wide conversation (execs and admins only), which may read any team's calls. */
export async function readTranscript(teamId: string | null, callId: string, offset = 0, limit = 3) {
  const call = await getCall(callId);
  if (!call || (teamId !== null && call.teamId !== teamId)) throw new Error("Call not found");
  const rows = await db
    .select()
    .from(sellSideParts)
    .where(and(eq(sellSideParts.callId, callId), sql`${sellSideParts.seq} >= ${offset}`))
    .orderBy(asc(sellSideParts.seq))
    .limit(limit);
  return {
    data: {
      callId,
      title: call.title,
      parts: rows.map((p) => ({ seq: p.seq, text: p.text, sourceId: transcriptSource(call, p.seq, p.text ?? "").id })),
      nextOffset: rows.length === limit ? rows.at(-1)!.seq + 1 : null,
    },
    sources: rows.filter((p) => p.text).map((p) => transcriptSource(call, p.seq, p.text!)),
  };
}
export async function searchTranscripts(teamId: string | null, ticker?: string, query?: string) {
  const conditions = [sql`${sellSideParts.text} IS NOT NULL`];
  if (teamId !== null) conditions.push(eq(sellSideCalls.teamId, teamId));
  if (ticker) conditions.push(eq(sellSideCalls.ticker, ticker.toUpperCase()));
  if (query) conditions.push(sql`to_tsvector('english', coalesce(${sellSideParts.text}, '')) @@ plainto_tsquery('english', ${query})`);
  const rows = await db
    .select({ call: sellSideCalls, part: sellSideParts })
    .from(sellSideParts)
    .innerJoin(sellSideCalls, eq(sellSideCalls.id, sellSideParts.callId))
    .where(and(...conditions))
    .orderBy(desc(sellSideCalls.createdAt), asc(sellSideParts.seq))
    .limit(12);
  return {
    data: {
      passages: rows.map(({ call, part }) => ({
        callId: call.id,
        ticker: call.ticker,
        title: call.title,
        seq: part.seq,
        text: part.text,
        sourceId: transcriptSource(call, part.seq, part.text!).id,
      })),
    },
    sources: rows.map(({ call, part }) => transcriptSource(call, part.seq, part.text!)),
  };
}
