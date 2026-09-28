import type { Metadata } from "next";
import { ECONOMIC_DEFAULT_SHOW } from "@/lib/earnings-calendar";
import { CalendarPage } from "../earnings/calendar-page";

export const metadata: Metadata = { title: "Economic calendar" };

/** The Calendar with only the economic releases shown; the Show filters bring the earnings back. */
export default async function EconomicCalendarPage({ params, searchParams }: PageProps<"/t/[team]/economic-calendar">) {
  const [{ team }, sp] = await Promise.all([params, searchParams]);
  return <CalendarPage slug={team} sp={sp} route="economic-calendar" defaultShow={[...ECONOMIC_DEFAULT_SHOW]} />;
}
