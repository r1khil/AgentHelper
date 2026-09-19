import { validateRange } from "@/lib/economic-calendar/dates";
import {
  calendarPreviewEnabled,
  previewCalendar,
} from "@/lib/economic-calendar/preview";

export async function GET(request: Request) {
  if (!calendarPreviewEnabled()) return new Response(null, { status: 404 });
  const params = new URL(request.url).searchParams;
  try {
    return Response.json(
      previewCalendar(validateRange(params.get("from"), params.get("to"))),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Invalid date range." }, { status: 400 });
  }
}
