import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driveConnection, type DriveConnection } from "@/db/schema";
import { openSecret } from "./crypto";
import { GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL } from "./oauth";

export function driveConfigured() {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.DRIVE_TOKEN_KEY);
}

/** The callback must match a redirect URI registered on the OAuth client; it follows the request origin so dev ports work. */
export function driveRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/google/callback`;
}

export class DriveNotConnected extends Error {
  constructor(message = "Google Drive is not connected. An admin can connect it from the Admin page.") {
    super(message);
    this.name = "DriveNotConnected";
  }
}

export async function loadConnection(): Promise<DriveConnection | null> {
  const [row] = await db.select().from(driveConnection).where(eq(driveConnection.id, 1)).limit(1);
  return row ?? null;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "", ...params }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || json.error) {
    throw Object.assign(new Error(json.error_description ?? json.error ?? `Google token endpoint returned ${res.status}`), { code: json.error ?? String(res.status) });
  }
  return json;
}

export async function exchangeCode(code: string, redirectUri: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

type CachedToken = { token: string; expiresAt: number };
const g = globalThis as unknown as { __driveToken?: CachedToken };

export function clearTokenCache() {
  g.__driveToken = undefined;
}

export async function markReconnectNeeded(reason: string) {
  clearTokenCache();
  await db.update(driveConnection).set({ lastError: `reconnect: ${reason}` }).where(eq(driveConnection.id, 1));
}

/** Access token from the stored refresh token, cached in memory until a minute before expiry. */
export async function getAccessToken(force = false): Promise<string> {
  if (!force && g.__driveToken && g.__driveToken.expiresAt - 60_000 > Date.now()) return g.__driveToken.token;
  if (!driveConfigured()) throw new DriveNotConnected("Google Drive is not configured (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, DRIVE_TOKEN_KEY).");
  const conn = await loadConnection();
  if (!conn) throw new DriveNotConnected();
  let refresh: string;
  try {
    refresh = openSecret(conn.refreshTokenEnc, process.env.DRIVE_TOKEN_KEY!);
  } catch {
    throw new DriveNotConnected("The stored Google token cannot be decrypted (DRIVE_TOKEN_KEY changed?). Reconnect from Admin.");
  }
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
    if (!t.access_token) throw new Error("Google returned no access token");
    g.__driveToken = { token: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
    return t.access_token;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "invalid_grant" || code === "invalid_client" || code === "unauthorized_client") {
      await markReconnectNeeded(code);
      throw new DriveNotConnected(`Google Drive needs to be reconnected from Admin (${code}).`);
    }
    throw e;
  }
}

/** Revoke our own refresh token at Google (best effort). This never touches files. */
export async function revokeStoredToken(conn: DriveConnection) {
  try {
    const refresh = openSecret(conn.refreshTokenEnc, process.env.DRIVE_TOKEN_KEY ?? "");
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(refresh)}`, { method: "POST" });
  } catch {
    // The row is deleted regardless; a stale token without our client secret is inert.
  }
  clearTokenCache();
}
