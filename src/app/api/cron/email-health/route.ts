import { authorizeCron } from "@/lib/jobs/auth";
import { checkEmailProviders } from "@/lib/jobs/notify";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Whether each email provider (OpenMail, Gmail, Resend) could send right now. Sends nothing. */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return new Response("Unauthorized", { status: 401 });
  return Response.json(await checkEmailProviders());
}
