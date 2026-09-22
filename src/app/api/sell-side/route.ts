import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { chats, holdings, sellSideCalls, teams } from "@/db/schema";
import { canAccessTeam, getCurrentUser } from "@/lib/auth";
import { newCallSchema } from "@/lib/sell-side/company";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = newCallSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a company, enter its name and ticker if needed, and add a call title." }, { status: 400 });
  const input = parsed.data;
  if (!canAccessTeam(user, input.teamId)) return Response.json({ error: "Not found" }, { status: 404 });
  const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, input.teamId)).limit(1);
  if (!team) return Response.json({ error: "Not found" }, { status: 404 });
  let holdingId: string | null = null;
  let ticker: string;
  let title = input.title;
  if (input.companyType === "holding") {
    const [holding] = await db.select().from(holdings).where(eq(holdings.id, input.holdingId)).limit(1);
    if (!holding || holding.teamId !== input.teamId) return Response.json({ error: "Not found" }, { status: 404 });
    holdingId = holding.id;
    ticker = holding.ticker;
  } else {
    ticker = input.ticker;
    // Preserve the company identity in the saved title and chat context without inventing a holding.
    title = `${input.companyName} · ${input.title}`;
  }
  try {
    const call = await db.transaction(async (tx) => {
      const [chat] = await tx
        .insert(chats)
        .values({ teamId: input.teamId, holdingId, createdBy: user.id, title: `Call: ${ticker} · ${title}` })
        .returning();
      const [call] = await tx.insert(sellSideCalls).values({ teamId: input.teamId, holdingId, chatId: chat.id, createdBy: user.id, ticker, title }).returning();
      return call;
    });
    return Response.json(call);
  } catch (error) {
    // Drizzle wraps the database error. Never serialize the query/parameters or connection error.
    const cause = (error as { cause?: { code?: string; column?: string } }).cause ?? (error as { code?: string; column?: string });
    if (cause.code === "23502" && cause.column === "holding_id")
      return Response.json(
        { error: "Other-company calls need a workspace update. Ask your administrator to apply the sell-side company migration." },
        { status: 503 },
      );
    return Response.json({ error: "The call could not be saved. Please try again." }, { status: 503 });
  }
}
