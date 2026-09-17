import "server-only";
import { getCurrentUser } from "@/lib/auth";

/** Cron routes accept the CRON_SECRET bearer token (Vercel Cron) or a signed-in admin. */
export async function authorizeCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) return true;
  const user = await getCurrentUser();
  return user?.role === "admin";
}
