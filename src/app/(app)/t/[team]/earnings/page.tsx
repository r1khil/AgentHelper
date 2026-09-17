import type { Metadata } from "next";
import Link from "next/link";
import { loadTeam } from "@/lib/teams";
import { listTeamEarnings } from "@/lib/earnings";
import { fmtDate, fmtMoney } from "@/lib/format";
import { todayNY } from "@/lib/providers/calendar";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { StatusBadge } from "@/components/app/status-badge";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Earnings" };

export default async function EarningsPage({ params }: { params: Promise<{ team: string }> }) {
  const { team: slug } = await params;
  const { team } = await loadTeam(slug);
  const rows = await listTeamEarnings(team.id);
  const today = todayNY();
  const upcoming = rows.filter((r) => r.e.status === "upcoming" && r.e.reportDate >= today).sort((a, b) => (a.e.reportDate < b.e.reportDate ? -1 : 1));
  const past = rows.filter((r) => !(r.e.status === "upcoming" && r.e.reportDate >= today));

  return (
    <>
      <PageHeader title="Earnings" description="Record your expectations before each report. Afterwards the agent gathers the sourced results and you write the reflection." />
      {rows.length === 0 ? (
        <EmptyState title="No earnings dates yet">Dates are pulled each morning for every holding. An admin can run the morning sweep now from the Admin page.</EmptyState>
      ) : (
        <>
          <Section title="Upcoming" rows={upcoming} slug={team.slug} />
          {past.length > 0 && <Section title="Reported" rows={past} slug={team.slug} />}
        </>
      )}
    </>
  );
}

function Section({ title, rows, slug }: { title: string; rows: Awaited<ReturnType<typeof listTeamEarnings>>; slug: string }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">{title} <span className="text-muted-foreground">{rows.length}</span></h2>
      <Card className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nothing scheduled.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Report date</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">EPS est.</TableHead>
                <TableHead>Prep</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ e, h }) => (
                <TableRow key={e.id}>
                  <TableCell><Link href={`/t/${slug}/earnings/${e.id}`} className="font-semibold hover:underline">{h.ticker}</Link></TableCell>
                  <TableCell className="tnum">{fmtDate(e.reportDate)}{e.reportHour ? <span className="ml-1 text-xs text-muted-foreground">{e.reportHour.toUpperCase()}</span> : null}</TableCell>
                  <TableCell><Badge variant="outline">{e.dateStatus}</Badge></TableCell>
                  <TableCell className="tnum text-right">{e.epsEstimate ? fmtMoney(e.epsEstimate) : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{e.preLockedAt ? "locked" : e.expectations ? "draft" : "not started"}</TableCell>
                  <TableCell><StatusBadge status={e.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
