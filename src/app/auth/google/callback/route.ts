import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { completeGoogleSignIn } from "@/lib/google-signin";
import { GOOGLE_OAUTH_COOKIE, exchangeGoogleCode, parseGoogleOAuthState } from "@/lib/google-oauth";

// Google sends the user back here (on the app's own domain) after the consent
// screen. The code is exchanged for an ID token, which Supabase verifies and
// turns into a session, so the user never touches <ref>.supabase.co.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const cookieStore = await cookies();
  const stored = parseGoogleOAuthState(cookieStore.get(GOOGLE_OAUTH_COOKIE)?.value);
  cookieStore.delete(GOOGLE_OAUTH_COOKIE);

  const fail = (message: string) => NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);

  const googleError = searchParams.get("error");
  if (googleError) {
    return fail(googleError === "access_denied" ? "Google sign-in was cancelled" : `Google sign-in failed (${googleError})`);
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state || !stored || stored.state !== state) {
    return fail("That sign-in attempt expired. Please try again.");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("Google sign-in is not configured");

  let idToken: string;
  try {
    idToken = await exchangeGoogleCode({ code, redirectUri: stored.redirectUri, clientId, clientSecret });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Google sign-in failed");
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce: stored.nonce });
  if (error || !data.user) return fail(error?.message ?? "Sign-in failed");

  const next = stored.next.startsWith("/") && !stored.next.startsWith("//") ? stored.next : "/";
  return completeGoogleSignIn(supabase, data.user, origin, next);
}
