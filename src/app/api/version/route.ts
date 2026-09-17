import { getBuildId } from "@/lib/build-id";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ buildId: getBuildId() }, { headers: { "Cache-Control": "no-store" } });
}
