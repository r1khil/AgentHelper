import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { driveConnection } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { clearTokenCache, driveConfigured, driveRedirectUri, exchangeCode } from "@/lib/drive/auth";
import { sealSecret } from "@/lib/drive/crypto";
import { hasRequiredScopes } from "@/lib/drive/oauth";
import { about } from "@/lib/drive/read";
import { ensureDriveWatch } from "@/lib/jobs/drive";

export const dynamic = "force-dynamic";

/** Google redirects here after consent. Admin-only; stores the refresh token encrypted. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new Response("Forbidden", { status: 403 });
  const { origin, searchParams } = new URL(req.url);
  const fail = (message: string) => {
    const res = NextResponse.redirect(`${origin}/admin?tab=jobs&error=${encodeURIComponent(message)}`);
    res.cookies.delete({ name: "drive_oauth_state", path: "/api/google" });
    return res;
  };
  if (!driveConfigured()) return fail("Google Drive is not configured");
  const denied = searchParams.get("error");
  if (denied) return fail(`Google returned: ${denied}`);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expected = req.cookies.get("drive_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) return fail("Sign-in state did not match; try connecting again");

  try {
    const tokens = await exchangeCode(code, driveRedirectUri(origin));
    if (!tokens.access_token) return fail("Google returned no access token");
    if (!tokens.refresh_token) return fail("Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.");
    if (!hasRequiredScopes(tokens.scope)) return fail("Both Drive permissions (read files, add files) must be granted");
    const account = await about(tokens.access_token);
    const values = {
      accountEmail: account.emailAddress,
      refreshTokenEnc: sealSecret(tokens.refresh_token, process.env.DRIVE_TOKEN_KEY!),
      scopes: (tokens.scope ?? "").split(/\s+/).filter(Boolean),
      connectedBy: user.id,
      connectedAt: new Date(),
      lastError: null,
    };
    await db.insert(driveConnection).values({ id: 1, ...values }).onConflictDoUpdate({ target: driveConnection.id, set: values });
    clearTokenCache();
    // A reconnect keeps the root folder; re-register the notification channel under the fresh token.
    await ensureDriveWatch({ force: true }).catch(() => undefined);
    revalidatePath("/admin");
    const res = NextResponse.redirect(`${origin}/admin?tab=jobs&ok=${encodeURIComponent(`Connected Google Drive as ${account.emailAddress}. Now set the root folder.`)}`);
    res.cookies.delete({ name: "drive_oauth_state", path: "/api/google" });
    return res;
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
