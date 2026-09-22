import type { Metadata } from "next";
import Link from "next/link";
import { loadScope } from "@/lib/teams";
import type { Team } from "@/db/schema";
import { listTeamMovements } from "@/lib/movements";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { MOVEMENT_THRESHOLD_PP } from "@/lib/constants";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Move } from "@/components/app/move";
import { StatusBadge } from "@/components/app/status-badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Movements" };

export default async function MovementsPage({ params }: { params: Promise<{ team: string }> }) {
  const { team: slug } = await params;
  const scope = await loadScope(slug);
  const rows = await listTeamMovements(scope.teamIds);
  const showTeam = scope.kind === "fund";
  const open = rows.filter((r) => r.m.status !== "completed");
  const done = rows.filter((r) => r.m.status === "completed");

  return (
    <>
      <PageHeader title="Major movements" description={`Sessions where a holding's close moved at least ${MOVEMENT_THRESHOLD_PP} pp against the S&P 500. Checked nightly after the close.`} />
      {rows.length === 0 ? (
        <EmptyState title="No movements yet">The close check runs every trading day. Qualifying moves appear here with evidence attached and an owner assigned.</EmptyState>
      ) : (
        <>
          <MovementTable title="Open" rows={open} teamById={scope.teamById} showTeam={showTeam} />
          {done.length > 0 && <MovementTable title="Completed" rows={done} teamById={scope.teamById} showTeam={showTeam} />}
        </>
      )}
    </>
  );
}

function MovementTable({ title, rows, teamById, showTeam }: { title: string; rows: Awaited<ReturnType<typeof listTeamMovements>>; teamById: Map<string, Team>; showTeam: boolean }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">{title} <span className="text-muted-foreground">{rows.length}</span></h2>
      <Card className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nothing open.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Ticker</TableHead>
                {showTeam && <TableHead>Team</TableHead>}
                <TableHead className="text-right">Holding</TableHead>
                <TableHead className="text-right">S&amp;P</TableHead>
                <TableHead className="text-right">Relative</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ m, h, ownerName }) => (
                <TableRow key={m.id}>
                  <TableCell className="tnum">{fmtDate(m.sessionDate)}</TableCell>
                  <TableCell>
                    <Link href={`/t/${teamById.get(h.teamId)?.slug}/movements/${m.id}`} className="font-semibold hover:underline">
                      {h.ticker}
                    </Link>
                  </TableCell>
                  {showTeam && <TableCell className="text-muted-foreground">{teamById.get(h.teamId)?.name}</TableCell>}
                  {m.dataQuality ? (
                    <TableCell colSpan={3} className="text-warning-foreground">Data quality: {m.dataQuality}</TableCell>
                  ) : (
                    <>
                      <TableCell className="text-right"><Move value={m.holdingReturnPct} unit="%" digits={2} /></TableCell>
                      <TableCell className="text-right"><Move value={m.spxReturnPct} unit="%" digits={2} /></TableCell>
                      <TableCell className="text-right font-semibold"><Move value={m.relativeMovePp} unit=" pp" /></TableCell>
                    </>
                  )}
                  <TableCell className={ownerName ? "" : "text-warning-foreground"}>{ownerName ?? "Unassigned"}</TableCell>
                  <TableCell className="tnum text-muted-foreground">{fmtDateTime(m.dueAt)}</TableCell>
                  <TableCell><StatusBadge status={m.status} dueAt={m.dueAt} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
