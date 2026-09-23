import { loadScope } from "@/lib/teams";
import { EconomicCalendar } from "@/components/app/economic-calendar/calendar";
import { calendarWeek } from "@/lib/economic-calendar/dates";

export default async function EconomicCalendarPage({
  params,
}: {
  params: Promise<{ team: string }>;
}) {
  const { team: slug } = await params;
  await loadScope(slug);
  return <EconomicCalendar initialRange={calendarWeek()} teamSlug={slug} />;
}
