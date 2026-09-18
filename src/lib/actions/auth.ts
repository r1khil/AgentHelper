"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { usernameToEmail } from "@/lib/constants";
import {
  GOOGLE_CALLBACK_PATH,
  GOOGLE_OAUTH_COOKIE,
  GOOGLE_OAUTH_TTL_SECONDS,
  googleAuthorizeUrl,
  googleOAuthConfigured,
  newGoogleOAuthState,
} from "@/lib/google-oauth";

function safeNext(next: FormDataEntryValue | null) {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

async function appOrigin() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return process.env.APP_URL && process.env.NODE_ENV === "production" ? process.env.APP_URL : `${proto}://${host}`;
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const origin = await appOrigin();

  if (googleOAuthConfigured()) {
    // Own-domain flow: Google's consent screen names this app, not the
    // Supabase project host. See src/lib/google-oauth.ts.
    const state = newGoogleOAuthState(next, `${origin}${GOOGLE_CALLBACK_PATH}`);
    const cookieStore = await cookies();
    cookieStore.set(GOOGLE_OAUTH_COOKIE, JSON.stringify(state), {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/",
      maxAge: GOOGLE_OAUTH_TTL_SECONDS,
    });
    redirect(googleAuthorizeUrl(process.env.GOOGLE_CLIENT_ID!, state));
  }

  // Fallback: Supabase-hosted OAuth (consent screen shows <ref>.supabase.co).
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent(error?.message ?? "Google sign-in failed")}`);
  redirect(data.url);
}

export async function signInWithPassword(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  if (!username || !password) redirect("/login?error=Enter+a+username+and+password");
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error) redirect(`/login?error=${encodeURIComponent("Wrong username or password")}`);
  redirect(next);
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
