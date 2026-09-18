import { createHash, randomBytes } from "node:crypto";

// Google sign-in that keeps the OAuth redirect on the app's own domain.
//
// Supabase's hosted OAuth flow sends users to Google with a redirect URI on
// <project-ref>.supabase.co, so Google's consent screen says "to continue to
// <project-ref>.supabase.co", which reads like a phishing page. Here the app
// talks to Google itself, with the redirect URI on the app's origin, and then
// hands Google's ID token to Supabase (`signInWithIdToken`), so Supabase Auth
// still owns the session and the invitation checks are unchanged.

export const GOOGLE_OAUTH_COOKIE = "owl_google_oauth";
export const GOOGLE_CALLBACK_PATH = "/auth/google/callback";
export const GOOGLE_OAUTH_TTL_SECONDS = 10 * 60;

const GOOGLE_AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export type GoogleOAuthState = {
  /** CSRF token echoed back by Google in `?state=`. */
  state: string;
  /** Raw nonce. Google receives its SHA-256 and Supabase checks it against the ID token. */
  nonce: string;
  /** Path to land on after sign-in. */
  next: string;
  /** Redirect URI used for the authorize request; must be reused for the token exchange. */
  redirectUri: string;
};

export function googleOAuthConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function newGoogleOAuthState(next: string, redirectUri: string): GoogleOAuthState {
  return {
    state: randomBytes(16).toString("hex"),
    nonce: randomBytes(16).toString("hex"),
    next,
    redirectUri,
  };
}

export function googleAuthorizeUrl(clientId: string, s: GoogleOAuthState) {
  const url = new URL(GOOGLE_AUTHORIZE_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", s.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", s.state);
  url.searchParams.set("nonce", sha256Hex(s.nonce));
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function parseGoogleOAuthState(raw: string | undefined | null): GoogleOAuthState | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const { state, nonce, next, redirectUri } = v as Record<string, unknown>;
    if ([state, nonce, next, redirectUri].some((x) => typeof x !== "string" || !x)) return null;
    return { state, nonce, next, redirectUri } as GoogleOAuthState;
  } catch {
    return null;
  }
}

export class GoogleTokenError extends Error {}

type TokenResponse = { id_token?: unknown; error?: unknown; error_description?: unknown };

/** Exchanges the authorization code for Google's ID token. */
export async function exchangeGoogleCode(
  params: { code: string; redirectUri: string; clientId: string; clientSecret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || typeof json.id_token !== "string") {
    const detail = [json.error, json.error_description].filter((x) => typeof x === "string").join(": ");
    throw new GoogleTokenError(detail || `Google token exchange failed (${res.status})`);
  }
  return json.id_token;
}
