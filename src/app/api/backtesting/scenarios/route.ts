import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { validateRange, validateWeights } from "@/lib/backtesting/engine";
import { loadSnapshot, resolveScenarioSnapshot } from "@/lib/backtesting/load";
import { deleteScenario, saveScenario } from "@/lib/backtesting/saved";
import { MAX_SCENARIO_COMPANIES } from "@/lib/backtesting/scenario";

const saveSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    note: z.string().trim().max(1000).optional(),
    version: z.string().length(64),
    weights: z.record(z.string().min(1).max(64), z.number().finite().min(0).max(1)),
    addedTickers: z.array(z.string().max(20)).max(MAX_SCENARIO_COMPANIES).default([]),
    from: z.string().length(10),
    to: z.string().length(10),
    benchmark: z.enum(["SPY", "QQQ", "IWM"]),
  })
  .strict();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** Save the scenario on screen so it can be shared by link with the rest of the Fund or team. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.onboardedAt) return json({ error: "Sign in and finish account setup first." }, 401);
  let body;
  try {
    const text = await request.text();
    if (text.length > 50000) return json({ error: "Request too large." }, 413);
    body = saveSchema.safeParse(JSON.parse(text));
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (!body.success) return json({ error: "Give the scenario a name and check its weights." }, 400);
  try {
    const snapshot = await loadSnapshot(user);
    if (snapshot.version !== body.data.version) return json({ error: "The saved portfolio changed. Reload this page to start from its current weights." }, 409);
    const scenario = body.data.addedTickers.length ? await resolveScenarioSnapshot(snapshot, body.data.addedTickers) : snapshot;
    validateRange(body.data.from, body.data.to);
    validateWeights(scenario.positions, body.data.weights);
    const added = scenario.positions.filter((p) => p.kind === "scenario").map((p) => ({ ticker: p.ticker, name: p.name }));
    const id = await saveScenario(user, scenario, { ...body.data, added });
    return json({ id });
  } catch (error) {
    console.error("[backtesting/scenarios]", error);
    return json({ error: error instanceof Error ? error.message : "Could not save the scenario." }, 422);
  }
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.onboardedAt) return json({ error: "Sign in first." }, 401);
  const id = new URL(request.url).searchParams.get("id") ?? "";
  try {
    return (await deleteScenario(user, id)) ? json({ ok: true }) : json({ error: "Not found." }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not remove the scenario." }, 403);
  }
}
