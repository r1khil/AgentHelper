import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { and, asc, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { earnings, holdings, movements, profiles, teams } from "@/db/schema";
import { requireUser, listAccessibleTeams, isFundWide } from "@/lib/auth";
import { marketSnapshot, type MarketSnapshot } from "@/lib/market";
import { fmtDate, fmtDateTime, fmtMoney, fmtPct } from "@/lib/format";
import { todayNY } from "@/lib/providers/calendar";
import { PageHeader, SectionTitle } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { Move } from "@/components/app/move";
import { StatusBadge } from "@/components/app/status-badge";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const user = await requireUser();
  const myTeams = await listAccessibleTeams(user);
  const teamIds = myTeams.map((t) => t.id);
  if (teamIds.length === 0) {
    return (
      <>
        <PageHeader title="Today" description={`Signed in as ${user.fullName}.`} />
        <EmptyState title="You are not on a team yet">Ask a Fund admin to assign you to a sector team.</EmptyState>
      </>
    );
  }

  const today = todayNY();
  const [openMovements, upcoming, activeHoldings] = await Promise.all([
    db
      .select({ m: movements, h: holdings, teamSlug: teams.slug, ownerName: profiles.fullName })
      .from(movements)
      .innerJoin(holdings, eq(holdings.id, movements.holdingId))
      .innerJoin(teams, eq(teams.id, holdings.teamId))
      .leftJoin(profiles, eq(profiles.id, movements.ownerId))
      .where(and(inArray(holdings.teamId, teamIds), ne(movements.status, "completed")))
      .orderBy(asc(movements.dueAt))
      .limit(30),
    db
      .select({ e: earnings, h: holdings, teamSlug: teams.slug })
      .from(earnings)
      .innerJoin(holdings, eq(holdings.id, earnings.holdingId))
      .innerJoin(teams, eq(teams.id, holdings.teamId))
      .where(and(inArray(holdings.teamId, teamIds), eq(earnings.status, "upcoming"), gte(earnings.reportDate, today)))
      .orderBy(asc(earnings.reportDate))
      .limit(12),
    db
      .select({ h: holdings, teamSlug: teams.slug, teamName: teams.name, ownerName: profiles.fullName })
      .from(holdings)
      .innerJoin(teams, eq(teams.id, holdings.teamId))
      .leftJoin(profiles, eq(profiles.id, holdings.ownerId))
      .where(and(inArray(holdings.teamId, teamIds), eq(holdings.status, "active")))
      .orderBy(asc(teams.sortOrder), asc(holdings.ticker)),
  ]);
  const mine = openMovements.filter((r) => r.m.ownerId === user.id);
  const others = openMovements.filter((r) => r.m.ownerId !== user.id);
  // Not awaited: the page renders from the database right away and the quotes stream into their Suspense
  // boundaries when Yahoo answers. One promise feeds both boundaries so it is a single provider call.
  const market = marketSnapshot(activeHoldings.map((r) => r.h.ticker));
  const fundWide = isFundWide(user);

  return (
    <>
      <PageHeader
        title="Today"
        description={
          <Suspense fallback={fmtDate(today)}>
            <MarketLine market={market} today={today} />
          </Suspense>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          <div>
            <SectionTitle aside={`${openMovements.length} open`}>Movement investigations</SectionTitle>
            {openMovements.length === 0 ? (
              <EmptyState title="Nothing open">Qualifying moves from the nightly close check land here with a deadline.</EmptyState>
            ) : (
              <Card className="divide-y p-0">
                {[...mine, ...others].map(({ m, h, teamSlug, ownerName }) => (
                  <Link key={m.id} href={`/t/${teamSlug}/movements/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                    <span className="w-14 font-semibold">{h.ticker}</span>
                    <span className="w-20 text-right"><Move value={m.relativeMovePp} unit=" pp" /></span>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      {fmtDate(m.sessionDate)} · {m.ownerId === user.id ? "you" : (ownerName ?? "unassigned")} · due {fmtDateTime(m.dueAt)}
                    </span>
                    <StatusBadge status={m.status} dueAt={m.dueAt} />
                  </Link>
                ))}
              </Card>
            )}
          </div>

          <div>
            <SectionTitle aside={fundWide ? "All teams" : myTeams[0]?.name}>Holdings</SectionTitle>
            <Suspense fallback={<HoldingsTable rows={activeHoldings} fundWide={fundWide} />}>
              <LiveHoldingsTable rows={activeHoldings} fundWide={fundWide} market={market} />
            </Suspense>
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <div>
            <SectionTitle>Upcoming earnings</SectionTitle>
            {upcoming.length === 0 ? (
              <EmptyState title="No dates yet">Earnings dates refresh every morning for each holding.</EmptyState>
            ) : (
              <Card className="divide-y p-0">
                {upcoming.map(({ e, h, teamSlug }) => (
                  <Link key={e.id} href={`/t/${teamSlug}/earnings/${e.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                    <span className="w-14 font-semibold">{h.ticker}</span>
                    <span className="tnum flex-1 text-sm">{fmtDate(e.reportDate)}{e.reportHour ? ` · ${e.reportHour.toUpperCase()}` : ""}</span>
                    <Badge variant="outline">{e.dateStatus}</Badge>
                  </Link>
                ))}
              </Card>
            )}
          </div>

          {fundWide && (
            <div>
              <SectionTitle>Teams</SectionTitle>
              <Card className="divide-y p-0">
                {myTeams.map((t) => (
                  <Link key={t.id} href={`/t/${t.slug}`} className="block px-4 py-2.5 text-sm hover:bg-muted/40">
                    {t.name}
                  </Link>
                ))}
              </Card>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

async function MarketLine({ market, today }: { market: Promise<MarketSnapshot>; today: string }) {
  const { spx } = await market;
  if (!spx) return fmtDate(today);
  return <>S&amp;P 500 {fmtPct(spx.changePct)}{spx.marketState && spx.marketState !== "REGULAR" ? " · market closed" : ""}. {fmtDate(today)}.</>;
}

type HoldingRow = { h: typeof holdings.$inferSelect; teamSlug: string; teamName: string; ownerName: string | null };

async function LiveHoldingsTable({ rows, fundWide, market }: { rows: HoldingRow[]; fundWide: boolean; market: Promise<MarketSnapshot> }) {
  return <HoldingsTable rows={rows} fundWide={fundWide} market={await market} />;
}

/** Without `market` the price columns show placeholders; that is the Suspense fallback while quotes load. */
function HoldingsTable({ rows, fundWide, market }: { rows: HoldingRow[]; fundWide: boolean; market?: MarketSnapshot }) {
  return (
    <Card className="overflow-x-auto p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ticker</TableHead>
            {fundWide && <TableHead>Team</TableHead>}
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Day</TableHead>
            <TableHead className="text-right">vs S&amp;P</TableHead>
            <TableHead>Owner</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-muted-foreground">No holdings yet.</TableCell></TableRow>
          ) : (
            rows.map(({ h, teamSlug, teamName, ownerName }) => {
              const q = market?.rows[h.ticker];
              return (
                <TableRow key={h.id}>
                  <TableCell><Link href={`/t/${teamSlug}/h/${h.ticker}`} className="font-semibold hover:underline">{h.ticker}</Link></TableCell>
                  {fundWide && <TableCell className="text-muted-foreground">{teamName}</TableCell>}
                  {market ? (
                    <>
                      <TableCell className="tnum text-right">{q?.quote ? fmtMoney(q.quote.price) : "—"}</TableCell>
                      <TableCell className="text-right"><Move value={q?.quote?.changePct} unit="%" digits={2} /></TableCell>
                      <TableCell className="text-right"><Move value={q?.relativePp} unit=" pp" /></TableCell>
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
            })
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
