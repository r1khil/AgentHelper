import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chats, holdings, sellSideCalls } from "@/db/schema";
import { canAccessTeam, getCurrentUser } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ holdingId: z.string().uuid(), title: z.string().trim().min(1).max(160) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a company and enter a call title." }, { status: 400 });
  const [h] = await db.select().from(holdings).where(eq(holdings.id, parsed.data.holdingId)).limit(1);
  if (!h || !canAccessTeam(user, h.teamId)) return Response.json({ error: "Not found" }, { status: 404 });
  const call = await db.transaction(async (tx) => {
    const [chat] = await tx
      .insert(chats)
      .values({ teamId: h.teamId, holdingId: h.id, createdBy: user.id, title: `Call: ${parsed.data.title}` })
      .returning();
    const [call] = await tx
      .insert(sellSideCalls)
      .values({ teamId: h.teamId, holdingId: h.id, chatId: chat.id, createdBy: user.id, ticker: h.ticker, title: parsed.data.title })
      .returning();
    return call;
  });
  return Response.json(call);
}
