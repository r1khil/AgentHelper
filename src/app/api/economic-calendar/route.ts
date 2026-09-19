import { getCurrentUser } from "@/lib/auth";
import { validateRange } from "@/lib/economic-calendar/dates";
import {
  CalendarNotConfigured,
  getEconomicCalendar,
} from "@/lib/economic-calendar/service";

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
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof CalendarNotConfigured
            ? error.message
            : "Calendar feed unavailable. Check provider access or try again shortly. No partial results are shown.",
      },
      {
        status: error instanceof CalendarNotConfigured ? 503 : 502,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
