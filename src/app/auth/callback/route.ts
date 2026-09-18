import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { completeGoogleSignIn } from "@/lib/google-signin";

// Supabase-hosted OAuth callback. Used only when GOOGLE_CLIENT_ID/SECRET are
// not set; otherwise sign-in goes through /auth/google/callback.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (!code) return NextResponse.redirect(`${origin}/login?error=Missing+sign-in+code`);

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error?.message ?? "Sign-in failed")}`);

  return completeGoogleSignIn(supabase, data.user, origin, next);
}
