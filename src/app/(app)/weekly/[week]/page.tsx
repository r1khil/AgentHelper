import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { todayNY } from "@/lib/providers/calendar";
import { isFriday, lastFriday, weekEndingLabel } from "@/lib/weekly/weeks";
import { WeeklyView } from "@/components/app/weekly/weekly-view";
import { loadPackList, loadPackView } from "../load";

export const metadata: Metadata = { title: "Weekly update" };
export const maxDuration = 300;

export default async function WeeklyPackPage({ params, searchParams }: PageProps<"/weekly/[week]">) {
  const me = await requireRole("exec", "admin");
  const { week } = await params;
  // Packs are keyed by the Friday the week ended on; anything else is not a pack.
  if (!isFriday(week)) notFound();
  const { ok, error } = await searchParams;
  const [packs, pack] = await Promise.all([loadPackList(), loadPackView(week, me.email)]);
  const target = lastFriday(todayNY());
  return (
    <WeeklyView
      packs={packs}
      selected={week}
      pack={pack}
      notice={{ ok: typeof ok === "string" ? ok : undefined, error: typeof error === "string" ? error : undefined }}
      target={{ week: target, label: weekEndingLabel(target), exists: packs.some((p) => p.weekEnding === target) }}
    />
  );
}
