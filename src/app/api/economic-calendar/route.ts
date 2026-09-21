import { getCurrentUser } from "@/lib/auth";
import { validateRange } from "@/lib/economic-calendar/dates";
import { getEconomicCalendar } from "@/lib/economic-calendar/service";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user)
    return Response.json(
      { error: "Sign in to view the calendar." },
      { status: 401 },
    );
  if (!user.onboardedAt)
    return Response.json(
      { error: "Complete account setup first." },
      { status: 403 },
    );
  const params = new URL(request.url).searchParams;
  let range;
  try {
    range = validateRange(params.get("from"), params.get("to"));
  } catch {
    return Response.json(
      { error: "Choose valid from/to dates, at most 31 days apart." },
      { status: 400 },
    );
  }
  try {
    return Response.json(await getEconomicCalendar(range), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Calendar providers are unavailable. Check API access and configuration, then try again. No synthetic events have been substituted.",
      },
      {
        status: 502,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
