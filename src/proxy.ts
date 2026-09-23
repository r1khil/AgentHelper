import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/drive/webhook receives Google Drive push notifications; it authenticates with its own per-channel token.
// /api/email/inbound receives Resend inbound email; it verifies the svix signature made with RESEND_WEBHOOK_SECRET.
const PUBLIC_PATHS = ["/login", "/not-invited", "/auth/callback", "/auth/google/callback", "/api/cron", "/api/health", "/api/version", "/api/drive/webhook", "/api/email/inbound", "/api/openmail/webhook"];

export async function proxy(request: NextRequest) {
  // Explicit local-only, synthetic calendar preview; never bypass app or live API authentication.
  if (process.env.NODE_ENV === "development" && process.env.ECONOMIC_CALENDAR_PREVIEW === "1" &&
      ["/dev/economic-calendar", "/api/dev/economic-calendar"].includes(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }
  // Only synthetic QA endpoints, behind an explicit development flag; live backtesting stays authenticated.
  if (process.env.NODE_ENV === "development" && process.env.BACKTESTING_PREVIEW === "1" &&
      ["/dev/backtesting", "/api/dev/backtesting", "/api/dev/backtesting/ticker"].includes(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // Refreshes the session cookie when needed, then verifies the access token locally against the project's
  // JWKS (cached per instance) instead of asking the Auth server on every request. Do not remove.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|glb)$).*)"],
};
