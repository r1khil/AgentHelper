import type { Metadata } from "next";
import { listAccessibleTeams, requireUser } from "@/lib/auth";
import { TodayView } from "./_today/today-view";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const user = await requireUser();
  return <TodayView user={user} myTeams={await listAccessibleTeams(user)} />;
}
