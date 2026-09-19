import { notFound } from "next/navigation";
import { requireTeamAccess } from "@/lib/auth";
import { getTeamBySlug } from "@/lib/teams";
import { EconomicCalendar } from "@/components/app/economic-calendar/calendar";
import { calendarWeek } from "@/lib/economic-calendar/dates";

export default async function EconomicCalendarPage({
  params,
}: {
  params: Promise<{ team: string }>;
}) {
  const { team: slug } = await params;
  const team = await getTeamBySlug(slug);
  if (!team) notFound();
  await requireTeamAccess(team.id);
  return <EconomicCalendar initialRange={calendarWeek()} />;
}
