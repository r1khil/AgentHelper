import { notFound } from "next/navigation";
import { EconomicCalendar } from "@/components/app/economic-calendar/calendar";
import { calendarWeek } from "@/lib/economic-calendar/dates";
import { calendarPreviewEnabled } from "@/lib/economic-calendar/preview";

export const dynamic = "force-dynamic";
export default function Preview() {
  if (!calendarPreviewEnabled()) notFound();
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <EconomicCalendar initialRange={calendarWeek()} preview />
    </main>
  );
}
