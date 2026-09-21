import { getEconomicCalendar } from "@/lib/economic-calendar/service";
import { validateRange } from "@/lib/economic-calendar/dates";
import {
  calendarPreviewEnabled,
  previewCalendar,
} from "@/lib/economic-calendar/preview";

export async function GET(request: Request) {
  if (!calendarPreviewEnabled()) return new Response(null, { status: 404 });
  const params = new URL(request.url).searchParams;
  let range;
  try {
    range = validateRange(params.get("from"), params.get("to"));
  } catch {
    return Response.json({ error: "Invalid date range." }, { status: 400 });
  }
  try {
    return Response.json(
      params.get("live") === "1"
        ? await getEconomicCalendar(range)
        : previewCalendar(range),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Calendar providers unavailable. Check API access and configuration." },
      { status: 502 },
    );
  }
}
