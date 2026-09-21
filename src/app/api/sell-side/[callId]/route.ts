import { after } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { sellSideCalls, sellSideParts } from "@/db/schema";
import { canAccessTeam, getCurrentUser } from "@/lib/auth";
import { agentConfigured } from "@/lib/agent/model";
import { signModelUpload } from "@/lib/storage";
import { callParts, getCall } from "@/lib/sell-side/store";
import { analyzeCall, processPart } from "@/lib/sell-side/process";
import { MAX_PARTS, assertComplete } from "@/lib/sell-side/types";

export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("upload"),
    seq: z
      .number()
      .int()
      .min(0)
      .max(MAX_PARTS - 1),
    mimeType: z.enum(["audio/webm", "audio/webm;codecs=opus", "audio/mp4"]),
    offset: z.number().min(0).max(86400),
    duration: z.number().positive().max(600),
  }),
  z.object({ action: z.literal("process"), expectedParts: z.number().int().min(1).max(MAX_PARTS) }),
  z.object({ action: z.literal("analyze") }),
]);
type Context = { params: Promise<{ callId: string }> };
async function authorized(ctx: Context) {
  const user = await getCurrentUser();
  if (!user) return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const { callId } = await ctx.params;
  if (!z.string().uuid().safeParse(callId).success) return { response: Response.json({ error: "Not found" }, { status: 404 }) };
  const call = await getCall(callId);
  if (!call || !canAccessTeam(user, call.teamId)) return { response: Response.json({ error: "Not found" }, { status: 404 }) };
  return { user, call };
}
export async function GET(_req: Request, ctx: Context) {
  const auth = await authorized(ctx);
  if (auth.response) return auth.response;
  const parts = await callParts(auth.call.id);
  return Response.json(
    { call: auth.call, parts: parts.map((p) => ({ seq: p.seq, offset: p.offset, duration: p.duration, segments: p.segments, summary: p.summary })) },
    { headers },
  );
}
export async function POST(req: Request, ctx: Context) {
  const auth = await authorized(ctx);
  if (auth.response) return auth.response;
  const { call, user } = auth;
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid recording request" }, { status: 400 });
  const p = parsed.data;
  try {
    if (p.action === "upload") {
      if (call.status !== "recording" || call.expectedParts !== null) return Response.json({ error: "This recording is already finalized" }, { status: 409 });
      const path = `calls/${call.teamId}/${call.id}/${p.seq}.${p.mimeType.includes("mp4") ? "mp4" : "webm"}`;
      await db
        .insert(sellSideParts)
        .values({ callId: call.id, seq: p.seq, path, mimeType: p.mimeType, offset: String(p.offset), duration: String(p.duration) })
        .onConflictDoNothing();
      return Response.json(await signModelUpload(path));
    }
    if (!agentConfigured() || !process.env.OPENAI_API_KEY)
      return Response.json(
        { error: "Configure OPENAI_API_KEY for transcription and OPENROUTER_API_KEY for analysis. Your audio remains saved." },
        { status: 503 },
      );
    if (call.status === "ready") return Response.json({ done: true });
    const lease = crypto.randomUUID();
    const [claimed] = await db
      .update(sellSideCalls)
      .set({ lease, updatedAt: new Date(), error: null })
      .where(and(eq(sellSideCalls.id, call.id), sql`(${sellSideCalls.lease} IS NULL OR ${sellSideCalls.updatedAt} < now() - interval '6 minutes')`))
      .returning();
    if (!claimed) return Response.json({ error: "This call is already processing. Try again shortly." }, { status: 409 });
    const release = async (error?: unknown) => {
      await db
        .update(sellSideCalls)
        .set({ lease: null, updatedAt: new Date(), ...(error ? { status: "error", error: error instanceof Error ? error.message : String(error) } : {}) })
        .where(and(eq(sellSideCalls.id, call.id), eq(sellSideCalls.lease, lease)));
    };
    if (p.action === "process") {
      try {
        if (call.expectedParts !== null && call.expectedParts !== p.expectedParts)
          throw new Error("Recording part count cannot change after processing starts.");
        const parts = await callParts(call.id);
        if (parts.length !== p.expectedParts || parts.some((part, i) => part.seq !== i)) throw new Error("Upload all recording parts before processing.");
        await db.update(sellSideCalls).set({ expectedParts: p.expectedParts, status: "transcribing" }).where(eq(sellSideCalls.id, call.id));
        await processPart(call.id);
        const completed = (await callParts(call.id)).filter((part) => part.summary).length;
        await release();
        return Response.json({ completed, total: p.expectedParts, done: completed === p.expectedParts });
      } catch (e) {
        await release(e);
        throw e;
      }
    }
    try {
      assertComplete(await callParts(call.id), call.expectedParts ?? 0);
    } catch (e) {
      await release(e);
      throw e;
    }
    await db.update(sellSideCalls).set({ status: "analyzing" }).where(eq(sellSideCalls.id, call.id));
    after(async () => {
      try {
        await analyzeCall(call.id, user);
        await release();
      } catch (e) {
        await release(e);
      }
    });
    return Response.json({ status: "analyzing" }, { status: 202 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Processing failed; retry." }, { status: 502 });
  }
}
