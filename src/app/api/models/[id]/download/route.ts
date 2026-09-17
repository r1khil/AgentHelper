import { NextResponse } from "next/server";
import { getCurrentUser, canAccessTeam } from "@/lib/auth";
import { getModel } from "@/lib/models";
import { signedModelUrl } from "@/lib/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const row = await getModel(id);
  if (!row || !canAccessTeam(user, row.h.teamId)) return new Response("Not found", { status: 404 });
  const url = await signedModelUrl(row.m.storagePath, row.m.fileName);
  return NextResponse.redirect(url);
}
