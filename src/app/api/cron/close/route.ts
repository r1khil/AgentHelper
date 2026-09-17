import { authorizeCron } from "@/lib/jobs/auth";
import { runCloseJob } from "@/lib/jobs/close";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? undefined;
  const force = url.searchParams.get("force") === "1";
  const result = await runCloseJob({ sessionDate: date, force });
  return Response.json(result);
}
