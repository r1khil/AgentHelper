"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { holdingNotes, holdings, teams } from "@/db/schema";
import { canManageTeam, requireTeamAccess, requireUser } from "@/lib/auth";
import { lookupCompany } from "@/lib/providers/yahoo";
import { tickerToCik } from "@/lib/providers/edgar";
import { scopedHref } from "@/lib/scope";
import { rememberedScope } from "@/lib/teams";

async function teamSlug(teamId: string) {
  const [t] = await db.select({ slug: teams.slug }).from(teams).where(eq(teams.id, teamId)).limit(1);
  return t?.slug ?? "";
}

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export async function addHolding(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = z
    .object({
      teamId: z.string().uuid(),
      ticker: z.string().trim().toUpperCase().regex(/^[A-Z0-9.\-]{1,10}$/, "Enter a ticker like NVDA"),
      thesis: z.string().trim().max(5000).optional(),
    })
    .safeParse({ teamId: fd.get("teamId"), ticker: fd.get("ticker"), thesis: fd.get("thesis") ?? "" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form" };
  const { teamId, ticker, thesis } = parsed.data;
  await requireTeamAccess(teamId);

  const dupe = await db.select({ id: holdings.id }).from(holdings).where(and(eq(holdings.teamId, teamId), eq(holdings.ticker, ticker), eq(holdings.status, "active"))).limit(1);
  if (dupe.length) return { ok: false, error: `${ticker} is already a holding` };

  const [company, cik] = await Promise.all([lookupCompany(ticker), tickerToCik(ticker)]);
  if (!company) return { ok: false, error: `Could not find ${ticker} on the market data provider` };

  await db.insert(holdings).values({
    teamId,
    ticker,
    companyName: cik?.name ?? company.name,
    cik: cik?.cik ?? null,
    thesis: thesis || null,
    thesisUpdatedAt: thesis ? new Date() : null,
  });
  revalidatePath(`/t/${await teamSlug(teamId)}`);
  return { ok: true, message: `Added ${ticker}` };
}

export async function updateThesis(fd: FormData) {
  const holdingId = String(fd.get("holdingId") ?? "");
  const thesis = String(fd.get("thesis") ?? "").trim().slice(0, 10000);
  const [h] = await db.select().from(holdings).where(eq(holdings.id, holdingId)).limit(1);
  if (!h) return;
  await requireTeamAccess(h.teamId);
  await db.update(holdings).set({ thesis: thesis || null, thesisUpdatedAt: new Date() }).where(eq(holdings.id, holdingId));
  revalidatePath(`/t/${await teamSlug(h.teamId)}/h/${h.ticker}`);
}

export async function exitHolding(fd: FormData) {
  const holdingId = String(fd.get("holdingId") ?? "");
  const [h] = await db.select().from(holdings).where(eq(holdings.id, holdingId)).limit(1);
  if (!h) return;
  const user = await requireTeamAccess(h.teamId);
  if (!canManageTeam(user, h.teamId)) return;
  await db.update(holdings).set({ status: "exited", exitedAt: new Date().toISOString().slice(0, 10) }).where(eq(holdings.id, holdingId));
  const slug = await teamSlug(h.teamId);
  revalidatePath(`/t/${slug}`);
  // Back to the holdings list in the scope the member is in (the fund's or this team's).
  redirect(scopedHref(await rememberedScope(user), slug));
}

export async function addNote(fd: FormData) {
  const holdingId = String(fd.get("holdingId") ?? "");
  const body = String(fd.get("body") ?? "").trim().slice(0, 10000);
  if (!body) return;
  const [h] = await db.select().from(holdings).where(eq(holdings.id, holdingId)).limit(1);
  if (!h) return;
  const user = await requireTeamAccess(h.teamId);
  await db.insert(holdingNotes).values({ holdingId, authorId: user.id, body });
  revalidatePath(`/t/${await teamSlug(h.teamId)}/h/${h.ticker}`);
}

export async function deleteNote(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const user = await requireUser();
  const [n] = await db.select().from(holdingNotes).where(eq(holdingNotes.id, id)).limit(1);
  if (!n) return;
  const [h] = await db.select().from(holdings).where(eq(holdings.id, n.holdingId)).limit(1);
  if (!h) return;
  if (n.authorId !== user.id && !canManageTeam(user, h.teamId)) return;
  await db.delete(holdingNotes).where(eq(holdingNotes.id, id));
  revalidatePath(`/t/${await teamSlug(h.teamId)}/h/${h.ticker}`);
}
