import { loadScope } from "@/lib/teams";
import { EconomicCalendar } from "@/components/app/economic-calendar/calendar";
import { calendarWeek } from "@/lib/economic-calendar/dates";
import { calendarFactorContext } from "@/lib/risk/factor-context";

export default async function EconomicCalendarPage({
  params,
}: {
  params: Promise<{ team: string }>;
}) {
  const { team: slug } = await params;
  const scope = await loadScope(slug);
  // Not awaited: the calendar renders at once and the factor lines stream in when the risk report is ready.
  const factorContext = calendarFactorContext(scope.user);
  return (
    <EconomicCalendar
      initialRange={calendarWeek()}
      teamSlug={slug}
      factorContext={factorContext}
    />
  );
}
