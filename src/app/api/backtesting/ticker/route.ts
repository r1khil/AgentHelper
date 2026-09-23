import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { resolveCompany } from "@/lib/providers/yahoo";
import { normalizeScenarioTicker } from "@/lib/backtesting/scenario";

const schema = z.object({ ticker: z.string().max(20) }).strict();
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.onboardedAt)
    return json({ error: "Sign in to add a company to a backtest." }, 401);
  let ticker;
  try {
    const text = await request.text();
    if (text.length > 500) return json({ error: "Request too large." }, 413);
    const input = schema.parse(JSON.parse(text));
    ticker = normalizeScenarioTicker(input.ticker);
  } catch {
    return json({ error: "Enter a valid ticker symbol." }, 400);
  }
  let company;
  try {
    company = await resolveCompany(ticker);
  } catch {
    return json({ error: `The market data provider is unavailable for ${ticker}. Please retry.` }, 502);
  }
  if (!company)
    return json({ error: `Could not recognize ${ticker} with the market data provider.` }, 404);
  try {
    return json({ ticker: normalizeScenarioTicker(company.symbol), name: company.name });
  } catch {
    return json({ error: `The provider returned an unsupported symbol for ${ticker}.` }, 422);
  }
}
