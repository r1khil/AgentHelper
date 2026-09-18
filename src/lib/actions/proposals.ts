"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { holdingProposals, holdings, teams } from "@/db/schema";
import { requireTeamAccess } from "@/lib/auth";

async function load(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const [p] = await db.select().from(holdingProposals).where(eq(holdingProposals.id, id)).limit(1);
  if (!p) return null;
  const [h] = await db.select({ h: holdings, slug: teams.slug }).from(holdings).innerJoin(teams, eq(teams.id, holdings.teamId)).where(eq(holdings.id, p.holdingId)).limit(1);
  if (!h) return null;
  const user = await requireTeamAccess(h.h.teamId);
  return { p, h: h.h, path: `/t/${h.slug}/h/${h.h.ticker}`, user };
}

/** Accept a proposed thesis (optionally edited). The holding changes only here, never during ingestion. */
export async function acceptHoldingProposal(fd: FormData) {
  const ctx = await load(fd);
  if (!ctx) return;
  const { p, h, path, user } = ctx;
  if (p.status !== "pending") redirect(`${path}?error=${encodeURIComponent("That proposal was already decided.")}`);
  if (h.thesis?.trim()) redirect(`${path}?error=${encodeURIComponent("The thesis was set in the meantime; the proposal was left alone.")}`);
  const thesis = (String(fd.get("thesis") ?? "").trim() || p.proposed).slice(0, 10000);
  await db.transaction(async (tx) => {
    await tx.update(holdings).set({ thesis, thesisUpdatedAt: new Date() }).where(eq(holdings.id, h.id));
    await tx.update(holdingProposals).set({ status: "accepted", decidedBy: user.id, decidedAt: new Date(), proposed: thesis }).where(eq(holdingProposals.id, p.id));
  });
  revalidatePath(path);
}

export async function dismissHoldingProposal(fd: FormData) {
  const ctx = await load(fd);
  if (!ctx) return;
  const { p, path, user } = ctx;
  if (p.status !== "pending") return;
  await db.update(holdingProposals).set({ status: "dismissed", decidedBy: user.id, decidedAt: new Date() }).where(eq(holdingProposals.id, p.id));
  revalidatePath(path);
}
