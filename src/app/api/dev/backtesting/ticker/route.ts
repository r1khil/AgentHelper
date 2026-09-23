import { z } from "zod";
import { previewEnabled } from "@/lib/backtesting/preview";
const schema = z.object({ ticker: z.string().trim().toUpperCase() }).strict();
export async function POST(request: Request) {
  if (!previewEnabled()) return new Response(null, { status: 404 });
  try {
    const { ticker } = schema.parse(await request.json());
    if (ticker !== "GAMMA")
      return Response.json({ error: "Synthetic preview recognizes GAMMA only." }, { status: 404 });
    return Response.json({ ticker, name: "Synthetic former holding" }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Enter GAMMA for the synthetic preview." }, { status: 400 });
  }
}
