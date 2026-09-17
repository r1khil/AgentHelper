import type { Metadata } from "next";
import Link from "next/link";
import { loadTeam } from "@/lib/teams";
import { listTeamHoldings, listTeamMembers } from "@/lib/holdings";
import { marketSnapshot } from "@/lib/market";
import { fmtMoney, fmtPct } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Move } from "@/components/app/move";
import { AddHoldingDialog } from "@/components/app/add-holding-dialog";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export async function generateMetadata({ params }: { params: Promise<{ team: string }> }): Promise<Metadata> {
  const { team } = await params;
  return { title: team };
}

export default async function TeamHoldingsPage({ params }: { params: Promise<{ team: string }> }) {
  const { team: slug } = await params;
  const { team, user } = await loadTeam(slug);
  const [rows, members] = await Promise.all([listTeamHoldings(team.id), listTeamMembers(team.id)]);
  const market = await marketSnapshot(rows.map((r) => r.h.ticker));
  const isMember = user.teamId === team.id;

  return (
    <>
      <PageHeader
        title={team.name}
        description={
          market.spx
            ? <>S&amp;P 500 {fmtPct(market.spx.changePct)} today{market.spx.marketState && market.spx.marketState !== "REGULAR" ? " · market closed" : ""}</>
            : market.error ?? "Holdings"
        }
        actions={<AddHoldingDialog teamId={team.id} members={members} defaultOwnerId={isMember ? user.id : null} />}
      />

      {rows.length === 0 ? (
        <EmptyState title="No holdings yet">Add the tickers this team covers. Each one gets live prices, filings, news, and movement alerts.</EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Day</TableHead>
                <TableHead className="text-right">vs S&amp;P</TableHead>
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ h, ownerName }) => {
                const m = market.rows[h.ticker];
                return (
                  <TableRow key={h.id}>
                    <TableCell>
                      <Link href={`/t/${team.slug}/h/${h.ticker}`} className="font-semibold hover:underline">
                        {h.ticker}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">{h.companyName}</TableCell>
                    <TableCell className="tnum text-right">{h.shares != null ? h.shares.toLocaleString("en-US") : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="tnum text-right">{h.weightPct != null ? fmtPct(h.weightPct, 2, false) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="tnum text-right">{m?.quote ? fmtMoney(m.quote.price) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right"><Move value={m?.quote?.changePct} unit="%" digits={2} /></TableCell>
                    <TableCell className="text-right"><Move value={m?.relativePp} unit=" pp" digits={1} /></TableCell>
                    <TableCell className={ownerName ? "" : "text-warning-foreground"}>{ownerName ?? "Unassigned"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
