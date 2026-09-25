import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { loadSnapshot, resolveScenarioSnapshot } from "@/lib/backtesting/load";
import { validateWeights } from "@/lib/backtesting/engine";
import { MAX_SCENARIO_COMPANIES } from "@/lib/backtesting/scenario";
import { LOOKBACKS, type LookbackKey } from "@/lib/risk/model";
import { scenarioRisk } from "@/lib/risk/scenario";

export const maxDuration = 60;
const schema = z
  .object({
    version: z.string().length(64),
    weights: z.record(z.string().min(1).max(64), z.number().finite().min(0).max(1)),
    addedTickers: z.array(z.string().max(20)).max(MAX_SCENARIO_COMPANIES).default([]),
    lookback: z.enum(Object.keys(LOOKBACKS) as [LookbackKey, ...LookbackKey[]]).default("1y"),
  })
  .strict();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** Risk of the saved and modified weights on the Backtesting page, with the Risk page's model. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.onboardedAt) return json({ error: "Sign in and finish account setup first." }, 401);
  let body;
  try {
    const text = await request.text();
    if (text.length > 50000) return json({ error: "Request too large." }, 413);
    body = schema.safeParse(JSON.parse(text));
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  if (!body.success) return json({ error: "Check the portfolio weights." }, 400);
  try {
    const snapshot = await loadSnapshot(user);
    if (snapshot.version !== body.data.version) return json({ error: "The saved portfolio changed. Reload this page to start from its current weights." }, 409);
    const scenario = body.data.addedTickers.length ? await resolveScenarioSnapshot(snapshot, body.data.addedTickers) : snapshot;
    validateWeights(scenario.positions, body.data.weights);
    return json(await scenarioRisk(user, scenario, body.data.weights, body.data.lookback));
  } catch (error) {
    console.error("[backtesting/risk]", error);
    return json({ error: error instanceof Error ? error.message : "Risk is unavailable. Please retry." }, 422);
  }
}
