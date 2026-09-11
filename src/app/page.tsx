import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { db } from "@/db/client";
import { AppShell } from "@/components/app/shell";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { RelativeMove } from "@/components/app/relative-move";
import { Timestamp, dueState } from "@/components/app/timestamp";
import { EmptyState } from "@/components/app/empty-state";
import { AlertIcon, ArrowOut } from "@/components/app/icons";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function Home() {
  const a = await requireActor();
  const sql = db();

  const teams = await sql`
    select t.*,
           count(distinct h.id)::int as holdings,
           count(distinct h.id) filter (where h.owner_id is null)::int as unowned,
           count(distinct i.id) filter (where i.status <> 'completed')::int as open
    from team t
    left join holding h on h.team_id = t.id
    left join investigation i on i.team_id = t.id
    where (${a.admin} or exists(
      select 1 from membership m where m.team_id = t.id and m.user_id = ${a.id}
    ))
    group by t.id
    order by t.name`;

  const investigations = await sql`
    select i.*, h.ticker, e.relative_move, t.name as team_name, u.name as owner_name
    from investigation i
    join movement_event e on e.id = i.event_id
    join holding h on h.id = e.holding_id
    join team t on t.id = i.team_id
    left join app_user u on u.id = i.owner_id
    where (${a.admin} or exists(
      select 1 from membership m where m.team_id = i.team_id and m.user_id = ${a.id}
    ))
    order by
      case when i.status = 'completed' then 1 else 0 end,
      i.due_at nulls last,
      i.created_at desc
    limit 30`;

  const briefings = await sql`
    select b.*, t.name
    from briefing b
    join team t on t.id = b.team_id
    where (${a.admin} or exists(
      select 1 from membership m where m.team_id = b.team_id and m.user_id = ${a.id}
    ))
    order by b.day desc
    limit 4`;

  // docs/mvp.md:32 -- a data-quality failure must be exposed for resolution,
  // not left to administrators to notice.
  const failures = await sql`
    select q.*, h.ticker
    from quality_failure q
    join holding h on h.id = q.holding_id
    where q.resolved_at is null
      and (${a.admin} or exists(
        select 1 from membership m where m.team_id = h.team_id and m.user_id = ${a.id}
      ))
    order by q.created_at desc
    limit 10`;

  const open = investigations.filter((i) => i.status !== "completed");
  const overdue = open.filter((i) => dueState(i.due_at) === "overdue");
  const mine = open.filter((i) => i.owner_id === a.id);
  const unowned = teams.reduce((n, t) => n + Number(t.unowned ?? 0), 0);

  return (
    <AppShell actor={a}>
      <PageHeader
        eyebrow="Research desk"
        title="Overview"
        description="Movements that qualified at the close, and the evidence prepared for them."
      />

      {/* What needs attention, before anything else. */}
      {(overdue.length > 0 || failures.length > 0 || unowned > 0) && (
        <div className="mb-6 grid gap-2">
          {overdue.length > 0 && (
            <Alert variant="destructive" className="flex items-center gap-2.5">
              <AlertIcon className="size-4" />
              <span>
                <strong className="font-semibold">
                  {overdue.length} investigation
                  {overdue.length === 1 ? " is" : "s are"} overdue
                </strong>{" "}
                — {overdue.map((i) => i.ticker).join(", ")}
              </span>
            </Alert>
          )}
          {failures.map((f) => (
            <Alert key={f.id} variant="destructive" className="flex items-center gap-2.5">
              <AlertIcon className="size-4" />
              <span>
                <strong className="font-semibold">
                  Data quality · {f.ticker}
                </strong>{" "}
                — {f.message}
              </span>
            </Alert>
          ))}
          {unowned > 0 && (
            <Alert className="flex items-center gap-2.5">
              <AlertIcon className="size-4" />
              <span>
                <strong className="font-semibold">
                  {unowned} holding{unowned === 1 ? "" : "s"} without an owner
                </strong>{" "}
                — responsibility falls back to the team lead until this is set.
              </span>
            </Alert>
          )}
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Open investigations" value={open.length}>
          {mine.length} assigned to you
        </Stat>
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "bad" : undefined}>
          Due noon Eastern, next trading day
        </Stat>
        <Stat label="Movement threshold" value="±4.0" unit="pp">
          Closing return relative to SPX
        </Stat>
      </div>

      <SectionHead
        title="Movement investigations"
        note="Official close · synthetic data"
      />
      <Card className="mb-8">
        {investigations.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Holding</TableHead>
                <TableHead className="text-right">Relative move</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Due · Eastern</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {investigations.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <span className="font-semibold">{i.ticker}</span>
                    <span className="text-muted-foreground ml-2 text-xs">
                      {i.team_name}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <RelativeMove value={i.relative_move} unit="pp" />
                  </TableCell>
                  <TableCell
                    className={i.owner_name ? undefined : "text-quality-fail"}
                  >
                    {i.owner_name ?? "No owner set"}
                  </TableCell>
                  <TableCell>
                    <Timestamp
                      value={i.due_at}
                      due={i.status !== "completed"}
                      absent="Not configured"
                    />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={i.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/investigations/${i.id}`}
                      className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                    >
                      Investigate
                      <ArrowOut className="size-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState className="border-0" title="No investigations yet">
            An administrator can run the synthetic replay from Administration.
          </EmptyState>
        )}
      </Card>

      <SectionHead title="Your teams" note="Shared context, distinct views" />
      {teams.length ? (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => (
            <Link key={t.id} href={`/teams/${t.id}`} className="group">
              <Card className="hover:border-primary h-full p-4 transition-colors">
                <div className="group-hover:text-primary font-serif text-lg transition-colors">
                  {t.name}
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  {t.holdings} holding{Number(t.holdings) === 1 ? "" : "s"} ·{" "}
                  {t.open} open investigation{Number(t.open) === 1 ? "" : "s"}
                </div>
                {Number(t.unowned) > 0 && (
                  <div className="text-quality-fail mt-1.5 text-xs font-semibold">
                    {t.unowned} without an owner
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState className="mb-8" title="No team membership yet">
          <Link href="/join" className="text-primary font-semibold hover:underline">
            Accept your invitation
          </Link>{" "}
          to see your team&rsquo;s research.
        </EmptyState>
      )}

      <SectionHead
        title="Daily briefings"
        note="Only when there is something to review"
        href="/briefings"
      />
      {briefings.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {briefings.map((b) => (
            <Link key={b.id} href={`/briefings/${b.id}`} className="group">
              <Card className="hover:border-primary h-full p-4 transition-colors">
                <div className="text-muted-foreground mb-2 flex items-center justify-between text-[10px] font-semibold tracking-[0.12em] uppercase">
                  <span>{b.name}</span>
                  <span>{b.day}</span>
                </div>
                <div className="group-hover:text-primary font-serif text-base leading-tight transition-colors">
                  {b.event_ids.length} movement
                  {b.event_ids.length === 1 ? "" : "s"} · {b.source_ids.length}{" "}
                  source{b.source_ids.length === 1 ? "" : "s"}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No briefing available">
          Empty briefings are suppressed.
        </EmptyState>
      )}
    </AppShell>
  );
}

function SectionHead({
  title,
  note,
  href,
}: {
  title: string;
  note?: string;
  href?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="font-serif text-lg">{title}</h2>
      {href ? (
        <Link
          href={href}
          className="text-muted-foreground hover:text-primary text-[10px] tracking-[0.12em] uppercase"
        >
          View all
        </Link>
      ) : (
        note && (
          <span className="text-muted-foreground text-[10px] tracking-[0.12em] uppercase">
            {note}
          </span>
        )
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  tone,
  children,
}: {
  label: string;
  value: number | string;
  unit?: string;
  tone?: "bad";
  children?: React.ReactNode;
}) {
  return (
    <Card className="px-4 py-3">
      <div className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
        {label}
      </div>
      <div
        className={`mt-1 font-serif text-3xl ${tone === "bad" && value ? "text-quality-fail" : ""}`}
      >
        {value}
        {unit && (
          <span className="text-muted-foreground ml-1 font-sans text-sm">
            {unit}
          </span>
        )}
      </div>
      <div className="text-muted-foreground mt-0.5 text-xs">{children}</div>
    </Card>
  );
}
