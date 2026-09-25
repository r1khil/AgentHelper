import type { Metadata } from "next";
import { listAccessibleTeams, requireUser } from "@/lib/auth";
import { TodayView } from "./_today/today-view";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const user = await requireUser();
  return <TodayView user={user} myTeams={await listAccessibleTeams(user)} />;
}
