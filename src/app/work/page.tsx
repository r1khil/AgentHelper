import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { db } from "@/db/client";
import { AppShell } from "@/components/app/shell";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { RelativeMove } from "@/components/app/relative-move";
import { Timestamp, dueState } from "@/components/app/timestamp";
import { EmptyState } from "@/components/app/empty-state";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

/**
 * The work queue. Ownership and deadlines are central to the spec -- every
 * investigation has a responsible owner and a due time, and reminders fire
 * against them -- but nothing in the app answered "what do I need to do
 * now?". Overdue work sorts first.
 */
export default async function Work() {
  const a = await requireActor();

  const rows = await db()`
    select i.*, h.ticker, e.relative_move, t.name as team_name
    from investigation i
    join movement_event e on e.id = i.event_id
    join holding h on h.id = e.holding_id
    join team t on t.id = i.team_id
    where i.owner_id = ${a.id} and i.status <> 'completed'
    order by i.due_at nulls last, i.created_at desc`;

  const overdue = rows.filter((r) => dueState(r.due_at) === "overdue").length;

  return (
    <AppShell actor={a}>
      <PageHeader
        eyebrow="Assigned to you"
        title="My work"
        description={
          rows.length
            ? `${rows.length} open investigation${rows.length === 1 ? "" : "s"}${
                overdue ? ` · ${overdue} overdue` : ""
              }`
            : undefined
        }
      />

      {rows.length ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Holding</TableHead>
                <TableHead className="text-right">Relative move</TableHead>
                <TableHead>Due · Eastern</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => (
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
                  <TableCell>
                    <Timestamp value={i.due_at} due />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={i.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/investigations/${i.id}`}
                      className="text-primary text-xs font-semibold hover:underline"
                    >
                      Investigate
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <EmptyState title="Nothing assigned to you">
          Investigations you own appear here, with overdue work first.
        </EmptyState>
      )}
    </AppShell>
  );
}
