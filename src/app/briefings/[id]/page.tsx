import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { assertTeam } from "@/lib/access";
import { db } from "@/db/client";
import { AppShell } from "@/components/app/shell";
import { PageHeader } from "@/components/app/page-header";
import { RelativeMove } from "@/components/app/relative-move";
import { EmptyState } from "@/components/app/empty-state";
import { ArrowOut } from "@/components/app/icons";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

export default async function Briefing({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const a = await requireActor();

  const [b] = await db()`
    select b.*, t.name
    from briefing b
    join team t on t.id = b.team_id
    where b.id = ${(await params).id}`;
  if (!b) notFound();

  try {
    await assertTeam(a, b.team_id);
  } catch {
    notFound();
  }

  const sources = b.source_ids.length
    ? await db()`select * from source where id in ${db()(b.source_ids)} and team_id = ${b.team_id}`
    : [];
  const events = b.event_ids.length
    ? await db()`
        select e.*, h.ticker, i.id as investigation_id, i.status
        from movement_event e
        join holding h on h.id = e.holding_id
        join investigation i on i.event_id = e.id
        where e.id in ${db()(b.event_ids)} and e.team_id = ${b.team_id}`
    : [];

  return (
    <AppShell actor={a}>
      <PageHeader
        eyebrow={`${b.name} · ${b.day}`}
        title="Evidence briefing"
        description="New material to review, with its sources intact."
      />

      <Alert variant="muted" className="mb-5">
        Synthetic development briefing. No investment conclusion is generated.
      </Alert>

      <h2 className="mb-3 font-serif text-lg">Movements to investigate</h2>
      {events.length ? (
        <div className="mb-8 grid gap-3 sm:grid-cols-2">
          {events.map((e) => (
            <Link key={e.id} href={`/investigations/${e.investigation_id}`} className="group">
              <Card className="hover:border-primary flex items-center justify-between gap-4 p-4 transition-colors">
                <div>
                  <div className="group-hover:text-primary font-serif text-lg transition-colors">
                    {e.ticker}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    versus SPX at the close
                  </div>
                </div>
                <div className="text-right">
                  <RelativeMove value={e.relative_move} unit="pp" className="text-xl" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState className="mb-8">
          No qualifying movements in this briefing.
        </EmptyState>
      )}

      <h2 className="mb-3 font-serif text-lg">New source material</h2>
      {sources.length ? (
        <Card className="divide-border grid divide-y">
          {sources.map((s) => (
            <Link
              key={s.id}
              href={`/sources/${s.id}`}
              className="hover:bg-muted/60 group flex items-center justify-between gap-4 px-4 py-3 transition-colors"
            >
              <span className="min-w-0">
                <span className="group-hover:text-primary block text-[13px] font-semibold transition-colors">
                  {s.title}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {s.publisher} · {s.location}
                </span>
              </span>
              <ArrowOut className="text-muted-foreground size-3.5 shrink-0" />
            </Link>
          ))}
        </Card>
      ) : (
        <EmptyState>No new source material in this briefing.</EmptyState>
      )}
    </AppShell>
  );
}
