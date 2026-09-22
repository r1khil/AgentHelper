import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { todayNY } from "@/lib/providers/calendar";
import { buildWeeklyNow } from "@/lib/actions/weekly";
import { listPacks, normalizeAgenda } from "@/lib/weekly/store";
import { packTitle, lastFriday, weekEndingLabel } from "@/lib/weekly/weeks";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Weekly update" };
// Building a pack calls the earnings and economic-calendar providers inside this request.
export const maxDuration = 300;

function Notice({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  return (
    <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${tone === "ok" ? "border-up/30 bg-up/5" : "border-destructive/30 bg-destructive/5 text-destructive"}`}>{children}</div>
  );
}

export default async function WeeklyIndexPage({ searchParams }: PageProps<"/weekly">) {
  await requireRole("exec", "admin");
  const { ok, error } = await searchParams;
  const packs = await listPacks();
  const target = lastFriday(todayNY());
  const haveTarget = packs.some((p) => p.weekEnding === target);

  return (
    <>
      <PageHeader
        title="Weekly update"
        description="The evidence for the Monday deck: performers, the coming week's earnings and market news, and the process updates the execs sent back."
        actions={
          <form action={buildWeeklyNow}>
            <Button type="submit" size="sm" variant={haveTarget ? "outline" : "default"}>
              <CalendarRange data-icon="inline-start" />
              Build pack for {weekEndingLabel(target)}
            </Button>
          </form>
        }
      />
      {ok && <Notice tone="ok">{ok}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {packs.length === 0 ? (
        <EmptyState title="No packs yet">
          Every Sunday at 09:00 New York the app builds the pack for the Friday that just passed — the week&apos;s best and worst performers, the coming week&apos;s
          earnings and economic releases, and last week&apos;s agenda rolled forward — then emails the execs for their process updates. Build the first one now,
          or wait for Sunday.
        </EmptyState>
      ) : (
        <Card className="divide-y p-0">
          {packs.map((p) => {
            const agenda = normalizeAgenda(p.agenda);
            const items = agenda.earnings.length + agenda.marketNews.length + agenda.processUpdates.length;
            return (
              <Link key={p.weekEnding} href={`/weekly/${p.weekEnding}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/40">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{packTitle(p.weekEnding)}</div>
                  <div className="text-xs text-muted-foreground">
                    {items} agenda {items === 1 ? "item" : "items"}
                    {p.performers ? ` · ${p.performers.top.length + p.performers.worst.length} ranked` : ""}
                    {p.builtAt ? ` · built ${fmtDateTime(p.builtAt)}` : " · not built"}
                  </div>
                </div>
                <Badge variant={p.status === "sent" ? "secondary" : "outline"}>{p.status === "sent" ? "Sent" : "Draft"}</Badge>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}
