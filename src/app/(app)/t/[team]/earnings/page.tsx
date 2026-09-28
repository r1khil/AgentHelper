import type { Metadata } from "next";
import { EARNINGS_DEFAULT_SHOW } from "@/lib/earnings-calendar";
import { CalendarPage } from "./calendar-page";

export const metadata: Metadata = { title: "Calendar" };

export default async function EarningsPage({ params, searchParams }: PageProps<"/t/[team]/earnings">) {
  const [{ team }, sp] = await Promise.all([params, searchParams]);
  return <CalendarPage slug={team} sp={sp} route="earnings" defaultShow={[...EARNINGS_DEFAULT_SHOW]} />;
}
