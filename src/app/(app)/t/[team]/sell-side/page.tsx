import Link from "next/link";
import { loadTeam } from "@/lib/teams";
import { listTeamHoldings } from "@/lib/holdings";
import { listCalls } from "@/lib/sell-side/store";
import { PageHeader } from "@/components/app/page-header";
import { callStatusLabel } from "@/lib/sell-side/status";
import { NewCall } from "@/components/app/sell-side/new-call";
export const metadata = { title: "Sell-side analyzer" };
export default async function SellSide({ params }: { params: Promise<{ team: string }> }) {
  const { team } = await loadTeam((await params).team);
  const [calls, holdings] = await Promise.all([listCalls(team.id), listTeamHoldings(team.id)]);
  return (
    <div className="space-y-6">
      <PageHeader title="Sell-side analyzer" description="Record the conversation. Review the evidence. Keep the transcript for future research." />
      <NewCall
        team={team.slug}
        teamId={team.id}
        holdings={holdings.map(({ h }) => ({
          id: h.id,
          ticker: h.ticker,
          companyName: h.companyName,
        }))}
      />
      <section className="space-y-3">
        <h2 className="font-semibold">Saved calls</h2>
        {!calls.length && <p className="text-sm text-muted-foreground">Your team’s calls, summaries, transcripts, and follow-up chats will appear here.</p>}
        {calls.map((c) => (
          <Link
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 hover:bg-muted/40"
            href={`/t/${team.slug}/sell-side/${c.id}`}
            key={c.id}
          >
            <div>
              <p className="text-sm font-medium">
                {c.ticker} · {c.title}
              </p>
              <p className="text-xs text-muted-foreground">{c.createdAt.toISOString().slice(0, 10)}</p>
            </div>
            <span className="text-xs capitalize">{callStatusLabel[c.status] ?? "Saved call"}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}
