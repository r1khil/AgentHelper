import Link from "next/link";
import { DateTime } from "luxon";
import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import type { CalendarEvent } from "@/lib/earnings-calendar";
import { fmtMoney } from "@/lib/format";
import { NY } from "@/lib/providers/calendar";
import { SectionTitle } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const HOURS: Record<string, string> = { bmo: "Before open", amc: "After close", dmh: "During market" };

export function EarningsDayList({ date, events, accessibleTeamIds }: { date: string; events: CalendarEvent[]; accessibleTeamIds: string[] }) {
  const accessible = new Set(accessibleTeamIds);
  const label = DateTime.fromISO(date, { zone: NY }).toFormat("cccc, LLLL d");
  return (
    <div className="mb-6">
      <SectionTitle aside={`${events.length} ${events.length === 1 ? "report" : "reports"}`}>{label}</SectionTitle>
      <Card className="overflow-x-auto p-0">
        {events.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No earnings on this day.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Team / sector</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">EPS est.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((ev) => {
                const linkable = ev.kind === "holding" && !!ev.teamId && accessible.has(ev.teamId) && !!ev.earningsId;
                return (
                  <TableRow key={`${ev.kind}:${ev.ticker}`}>
                    <TableCell>
                      {linkable ? (
                        <Link href={`/t/${ev.teamSlug}/earnings/${ev.earningsId}`} className="font-semibold hover:underline">
                          {ev.ticker}
                        </Link>
                      ) : (
                        <span className="font-semibold">{ev.ticker}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-56 truncate" title={ev.name}>
                      {ev.name}
                    </TableCell>
                    <TableCell>{ev.kind === "holding" ? <Badge>Holding</Badge> : <Badge variant="outline">Bellwether · {ev.etf}</Badge>}</TableCell>
                    <TableCell className="text-muted-foreground">{ev.kind === "holding" ? ev.teamName : ev.sector ? SECTOR_LABELS[ev.sector] : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{ev.industry ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{ev.reportHour ? (HOURS[ev.reportHour] ?? ev.reportHour.toUpperCase()) : "—"}</TableCell>
                    <TableCell>{ev.dateStatus ? <Badge variant="outline">{ev.dateStatus}</Badge> : "—"}</TableCell>
                    <TableCell className="tnum text-right">{ev.epsEstimate ? fmtMoney(ev.epsEstimate) : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
