/**
 * Pure OAuth helpers for the Google Drive connection.
 *
 * The app requests exactly two scopes:
 *   drive.readonly — read anything the admin places in the shared folder
 *   drive.file     — create folders/files; Google restricts edits to files the app created
 * There is deliberately no scope that could modify or delete the admin's own files.
 */
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"] as const;

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export function buildAuthUrl(p: { clientId: string; redirectUri: string; state: string }) {
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", DRIVE_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "false");
  u.searchParams.set("state", p.state);
  return u.toString();
}

/** True when a space-separated granted-scope string covers both required scopes. */
export function hasRequiredScopes(granted: string | undefined | null) {
  const set = new Set((granted ?? "").split(/\s+/).filter(Boolean));
  return DRIVE_SCOPES.every((s) => set.has(s));
}

/** Accepts a Drive folder URL, a `?id=` URL, or a bare folder id. */
export function parseFolderId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) ?? s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return null;
}
