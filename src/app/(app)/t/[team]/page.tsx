import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { loadScope } from "@/lib/teams";
import { FUND_SCOPE_SLUG } from "@/lib/constants";
import { listTeamHoldings, listTeamMembers } from "@/lib/holdings";
import { marketSnapshot, type MarketSnapshot } from "@/lib/market";
import { fmtMoney, fmtPct } from "@/lib/format";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Move } from "@/components/app/move";
import { AddHoldingDialog } from "@/components/app/add-holding-dialog";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Team } from "@/db/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export async function generateMetadata({ params }: { params: Promise<{ team: string }> }): Promise<Metadata> {
  const { team } = await params;
  return { title: team === FUND_SCOPE_SLUG ? "Fund holdings" : team };
}

export default async function TeamHoldingsPage({ params }: { params: Promise<{ team: string }> }) {
  const { team: slug } = await params;
  const scope = await loadScope(slug);
  const { team, user, teamById } = scope;
  const [rows, members] = await Promise.all([listTeamHoldings(scope.teamIds), team ? listTeamMembers(team.id) : []]);
  // Not awaited: the holdings render from the database at once and the quotes stream in when Yahoo answers.
  const market = marketSnapshot(rows.map((r) => r.h.ticker));
  const isMember = user.teamId === team?.id;
  const fund = scope.kind === "fund";
  // Adding needs a team to own the holding, so the fund view leaves it to the sector pages.

  return (
    <>
      <PageHeader
        title={team?.name ?? "Fund holdings"}
        description={
          <Suspense fallback="Holdings">
            <MarketLine market={market} />
          </Suspense>
        }
        actions={team ? <AddHoldingDialog teamId={team.id} members={members} defaultOwnerId={isMember ? user.id : null} /> : undefined}
      />

      {rows.length === 0 ? (
        <EmptyState title="No holdings yet" hoot="wave">{fund ? "Pick a sector team in the sidebar to add its tickers." : "Add the tickers this team covers."} Each one gets live prices, filings, news, and movement alerts.</EmptyState>
      ) : (
        <Suspense fallback={<HoldingsTable rows={rows} teamById={teamById} showTeam={fund} />}>
          <LiveHoldingsTable rows={rows} teamById={teamById} showTeam={fund} market={market} />
        </Suspense>
      )}
    </>
  );
}

async function MarketLine({ market }: { market: Promise<MarketSnapshot> }) {
  const { spx, error } = await market;
  if (!spx) return error ?? "Holdings";
  return <>S&amp;P 500 {fmtPct(spx.changePct)} today{spx.marketState && spx.marketState !== "REGULAR" ? " · market closed" : ""}</>;
}

type HoldingRow = Awaited<ReturnType<typeof listTeamHoldings>>[number];

type TableProps = { rows: HoldingRow[]; teamById: Map<string, Team>; showTeam: boolean };

async function LiveHoldingsTable({ market, ...props }: TableProps & { market: Promise<MarketSnapshot> }) {
  return <HoldingsTable {...props} market={await market} />;
}

/** Without `market` the price columns show placeholders; that is the Suspense fallback while quotes load. */
function HoldingsTable({ rows, teamById, showTeam, market }: TableProps & { market?: MarketSnapshot }) {
  return (
    <Card className="overflow-x-auto p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ticker</TableHead>
            <TableHead>Company</TableHead>
            {showTeam && <TableHead>Team</TableHead>}
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
            const m = market?.rows[h.ticker];
            const t = teamById.get(h.teamId);
            return (
              <TableRow key={h.id}>
                <TableCell>
                  <Link href={`/t/${t?.slug}/h/${h.ticker}`} className="font-semibold hover:underline">
                    {h.ticker}
                  </Link>
                </TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground">{h.companyName}</TableCell>
                {showTeam && <TableCell className="text-muted-foreground">{t?.name}</TableCell>}
                <TableCell className="tnum text-right">{h.shares != null ? Number(h.shares).toLocaleString("en-US", { maximumFractionDigits: 2 }) : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="tnum text-right">{h.weightPct != null ? fmtPct(h.weightPct, 2, false) : <span className="text-muted-foreground">—</span>}</TableCell>
                {market ? (
                  <>
                    <TableCell className="tnum text-right">{m?.quote ? fmtMoney(m.quote.price) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right"><Move value={m?.quote?.changePct} unit="%" digits={2} /></TableCell>
                    <TableCell className="text-right"><Move value={m?.relativePp} unit=" pp" digits={1} /></TableCell>
                  </>
                ) : (
                  <>
                    <TableCell><Skeleton className="ml-auto h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="ml-auto h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="ml-auto h-4 w-12" /></TableCell>
                  </>
                )}
                <TableCell className={ownerName ? "" : "text-warning-foreground"}>{ownerName ?? "Unassigned"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}
