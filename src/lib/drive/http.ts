import "server-only";
import { spaced } from "@/lib/providers/limiter";
import { DriveNotConnected, getAccessToken, markReconnectNeeded } from "./auth";

export class DriveError extends Error {
  constructor(
    message: string,
    public status: number,
    public reason?: string,
  ) {
    super(message);
    this.name = "DriveError";
  }
}

async function parseError(res: Response) {
  let reason: string | undefined;
  let message = `Google Drive returned ${res.status}`;
  try {
    const j = (await res.json()) as { error?: { message?: string; errors?: { reason?: string }[] } | string };
    if (typeof j.error === "string") message = j.error;
    else if (j.error) {
      message = j.error.message ?? message;
      reason = j.error.errors?.[0]?.reason;
    }
  } catch {
    // no JSON body
  }
  return new DriveError(message, res.status, reason);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Authenticated fetch against Google APIs: bearer token, one forced refresh on 401, backoff on 429/5xx,
 * and per-host spacing. Every Drive call in the app goes through here.
 */
export async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return spaced("drive", 50, async () => {
    let forceRefresh = false;
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const token = await getAccessToken(forceRefresh);
      forceRefresh = false;
      const res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${token}` } });
      if (res.ok) return res;
      if (res.status === 401) {
        if (!refreshed) {
          refreshed = true;
          forceRefresh = true;
          continue;
        }
        await markReconnectNeeded("Google rejected the access token");
        throw new DriveNotConnected("Google Drive rejected the connection. Reconnect from Admin.");
      }
      const err = await parseError(res);
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  });
}
