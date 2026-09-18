import { describe, expect, it } from "vitest";
import {
  exchangeGoogleCode,
  googleAuthorizeUrl,
  googleOAuthConfigured,
  newGoogleOAuthState,
  parseGoogleOAuthState,
  sha256Hex,
} from "./google-oauth";

describe("googleOAuthConfigured", () => {
  it("needs both the client id and the secret", () => {
    expect(googleOAuthConfigured({})).toBe(false);
    expect(googleOAuthConfigured({ GOOGLE_CLIENT_ID: "id" })).toBe(false);
    expect(googleOAuthConfigured({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" })).toBe(true);
  });
});

describe("googleAuthorizeUrl", () => {
  it("sends users to Google with the app's own redirect URI and a hashed nonce", () => {
    const s = newGoogleOAuthState("/holdings", "https://owlfund.example/auth/google/callback");
    const url = new URL(googleAuthorizeUrl("client-123", s));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://owlfund.example/auth/google/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe(s.state);
    expect(url.searchParams.get("nonce")).toBe(sha256Hex(s.nonce));
    expect(url.searchParams.get("nonce")).not.toBe(s.nonce);
    expect(url.hostname).not.toContain("supabase");
  });

  it("generates fresh random state and nonce per attempt", () => {
    const a = newGoogleOAuthState("/", "https://x/cb");
    const b = newGoogleOAuthState("/", "https://x/cb");
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.state).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("parseGoogleOAuthState", () => {
  it("round-trips a stored state", () => {
    const s = newGoogleOAuthState("/admin", "https://x/cb");
    expect(parseGoogleOAuthState(JSON.stringify(s))).toEqual(s);
  });

  it("rejects missing, malformed, or incomplete cookies", () => {
    expect(parseGoogleOAuthState(undefined)).toBeNull();
    expect(parseGoogleOAuthState("")).toBeNull();
    expect(parseGoogleOAuthState("not json")).toBeNull();
    expect(parseGoogleOAuthState("null")).toBeNull();
    expect(parseGoogleOAuthState(JSON.stringify({ state: "a", nonce: "b" }))).toBeNull();
    expect(parseGoogleOAuthState(JSON.stringify({ state: "a", nonce: "b", next: "/", redirectUri: "" }))).toBeNull();
  });
});

describe("exchangeGoogleCode", () => {
  const params = { code: "c", redirectUri: "https://x/cb", clientId: "id", clientSecret: "secret" };

  it("posts the code to Google's token endpoint and returns the id token", async () => {
    let seen: { url: string; body: URLSearchParams } | null = null;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), body: init!.body as URLSearchParams };
      return new Response(JSON.stringify({ id_token: "jwt" }), { status: 200 });
    }) as typeof fetch;
    await expect(exchangeGoogleCode(params, fetchImpl)).resolves.toBe("jwt");
    expect(seen!.url).toBe("https://oauth2.googleapis.com/token");
    expect(seen!.body.get("grant_type")).toBe("authorization_code");
    expect(seen!.body.get("redirect_uri")).toBe("https://x/cb");
    expect(seen!.body.get("client_secret")).toBe("secret");
  });

  it("surfaces Google's error description", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "Bad code" }), { status: 400 })) as typeof fetch;
    await expect(exchangeGoogleCode(params, fetchImpl)).rejects.toThrow("invalid_grant: Bad code");
  });

  it("fails when the response has no id token", async () => {
    const fetchImpl = (async () => new Response("{}", { status: 200 })) as typeof fetch;
    await expect(exchangeGoogleCode(params, fetchImpl)).rejects.toThrow("Google token exchange failed (200)");
  });
});
