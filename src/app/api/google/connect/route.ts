import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { driveConfigured, driveRedirectUri } from "@/lib/drive/auth";
import { buildAuthUrl } from "@/lib/drive/oauth";

export const dynamic = "force-dynamic";

/** Admin-only: start the Google consent flow for the Drive connection. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const { origin } = new URL(req.url);
  if (!driveConfigured()) return NextResponse.redirect(`${origin}/admin?tab=jobs&error=${encodeURIComponent("Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and DRIVE_TOKEN_KEY first")}`);
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthUrl({ clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!, redirectUri: driveRedirectUri(origin), state }));
  res.cookies.set("drive_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/google", maxAge: 600 });
  return res;
}
