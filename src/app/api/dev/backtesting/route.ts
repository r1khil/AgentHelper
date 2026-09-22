import { z } from "zod";
import { previewEnabled, previewReplay } from "@/lib/backtesting/preview";
const schema = z.object({
  from: z.string(),
  to: z.string(),
  benchmark: z.enum(["SPY", "QQQ", "IWM"]),
  weights: z.record(z.string().uuid(), z.number()),
});
export async function POST(request: Request) {
  if (!previewEnabled()) return new Response(null, { status: 404 });
  try {
    const { from, to, benchmark, weights } = schema.parse(await request.json());
    return Response.json(previewReplay(weights, benchmark, from, to), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid preview input.",
      },
      { status: 400 },
    );
  }
}
