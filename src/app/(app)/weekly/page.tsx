import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { todayNY } from "@/lib/providers/calendar";
import { lastFriday, weekEndingLabel } from "@/lib/weekly/weeks";
import { WeeklyView } from "@/components/app/weekly/weekly-view";
import { loadPackList, loadPackView } from "./load";

export const metadata: Metadata = { title: "Weekly update" };
// Building a pack calls the earnings and economic-calendar providers inside this request.
export const maxDuration = 300;

/** /weekly shows the latest pack; /weekly/[week] shows that week. Same layout. */
export default async function WeeklyIndexPage({ searchParams }: PageProps<"/weekly">) {
  const me = await requireRole("exec", "admin");
  const { ok, error } = await searchParams;
  const packs = await loadPackList();
  const target = lastFriday(todayNY());
  const selected = packs[0]?.weekEnding ?? null;
  const pack = selected ? await loadPackView(selected, me.email) : null;
  return (
    <WeeklyView
      packs={packs}
      selected={selected}
      pack={pack}
      notice={{ ok: typeof ok === "string" ? ok : undefined, error: typeof error === "string" ? error : undefined }}
      target={{ week: target, label: weekEndingLabel(target), exists: packs.some((p) => p.weekEnding === target) }}
    />
  );
}
