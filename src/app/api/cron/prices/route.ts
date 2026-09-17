import { authorizeCron } from "@/lib/jobs/auth";
import { runPricesJob } from "@/lib/jobs/prices";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runPricesJob());
}
