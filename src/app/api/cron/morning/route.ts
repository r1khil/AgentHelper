import { authorizeCron } from "@/lib/jobs/auth";
import { runMorningJob } from "@/lib/jobs/morning";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return new Response("Unauthorized", { status: 401 });
  const result = await runMorningJob();
  return Response.json(result);
}
