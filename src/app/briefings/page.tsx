import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { db } from "@/db/client";
import { AppShell } from "@/components/app/shell";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function Briefings() {
  const a = await requireActor();

  const briefings = await db()`
    select b.*, t.name
    from briefing b
    join team t on t.id = b.team_id
    where (${a.admin} or exists(
      select 1 from membership m where m.team_id = b.team_id and m.user_id = ${a.id}
    ))
    order by b.day desc
    limit 40`;

  return (
    <AppShell actor={a}>
      <PageHeader
        eyebrow="Daily briefings"
        title="Briefings"
        description="Material developments and upcoming catalysts, with citations intact. Empty briefings are suppressed."
      />

      {briefings.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {briefings.map((b) => (
            <Link key={b.id} href={`/briefings/${b.id}`} className="group">
              <Card className="hover:border-primary h-full p-4 transition-colors">
                <div className="text-muted-foreground mb-2 flex items-center justify-between text-[10px] font-semibold tracking-[0.12em] uppercase">
                  <span>{b.name}</span>
                  <span>{b.day}</span>
                </div>
                <div className="group-hover:text-primary font-serif text-lg leading-tight transition-colors">
                  {b.event_ids.length} movement
                  {b.event_ids.length === 1 ? "" : "s"} to investigate
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  {b.source_ids.length} source
                  {b.source_ids.length === 1 ? "" : "s"}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No briefings yet">
          A briefing is only produced when there is something material to
          review.
        </EmptyState>
      )}
    </AppShell>
  );
}
