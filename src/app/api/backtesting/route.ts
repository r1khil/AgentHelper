import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { loadSnapshot, runBacktest } from "@/lib/backtesting/load";

export const maxDuration = 120;
const schema = z
  .object({
    from: z.string().length(10),
    to: z.string().length(10),
    benchmark: z.enum(["SPY", "QQQ", "IWM"]),
    version: z.string().length(64),
    weights: z.record(z.string().uuid(), z.number().finite().min(0).max(1)),
  })
  .strict();
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.onboardedAt)
    return json(
      { error: "Sign in and finish account setup to backtest your portfolio." },
      401,
    );
  let body;
  try {
    const text = await request.text();
    if (text.length > 50000) return json({ error: "Request too large." }, 413);
    body = schema.safeParse(JSON.parse(text));
  } catch {
    return json({ error: "Invalid backtest request." }, 400);
  }
  if (!body.success)
    return json(
      { error: "Check the dates, benchmark, and portfolio weights." },
      400,
    );
  try {
    const snapshot = await loadSnapshot(user);
    if (snapshot.version !== body.data.version)
      return json(
        {
          error:
            "The saved portfolio changed. Reload this page to start from its current weights.",
        },
        409,
      );
    const { weights, benchmark, from, to } = body.data;
    return json(await runBacktest(snapshot, weights, benchmark, from, to));
  } catch (error) {
    console.error("[backtesting]", error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Backtesting is unavailable. Please retry.",
      },
      422,
    );
  }
}
