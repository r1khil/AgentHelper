import Link from "next/link";
import type { Team } from "@/db/schema";
import { fmtDateTime, fmtDayMonth } from "@/lib/format";
import { listHoldingSignals, listTeamHoldings, listTeamMembers } from "@/lib/holdings";
import { movementHref, scopeFor } from "@/lib/scope";
import { cn } from "@/lib/utils";

/**
 * A team's facts, in the Positions rail when the scope is one team (what its page's strip used to show): who leads it
 * and gets its emails, who is on it, the write-ups it owes, and its next report.
 */
export async function TeamCard({ team, scopeSlug, today }: { team: Team; scopeSlug: string; today: string }) {
  const rows = await listTeamHoldings(team.id);
  const [signals, members] = await Promise.all([listHoldingSignals(rows.map((r) => r.h.id), today), listTeamMembers(team.id)]);
  const now = nowMs();
  const leads = members.filter((m) => m.role === "lead_analyst");
  const associates = members.filter((m) => m.role === "associate_analyst");
  const open = [...signals.values()].flatMap((s) => (s.openMovement ? [s.openMovement] : []));
  const overdue = open.filter((m) => m.dueAt && m.dueAt.getTime() < now);
  const soonest = [...open].filter((m) => m.dueAt).sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())[0];
  const soonestTicker = soonest ? rows.find((r) => signals.get(r.h.id)?.openMovement?.id === soonest.id)?.h.ticker : undefined;
  const reports = [...signals.entries()].flatMap(([id, s]) => (s.nextReport ? [{ ticker: rows.find((r) => r.h.id === id)?.h.ticker ?? "", ...s.nextReport }] : [])).sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  const next = reports[0];

  const facts: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "down" }[] = [
    { label: "Leads", value: leads.length ? leads.map((l) => l.fullName).join(", ") : "None", note: leads.length ? "Get the movement and prep emails" : "No lead yet, so everyone on the team gets them" },
    { label: "Members", value: members.length, note: associates.length ? `${associates.length} associate ${associates.length === 1 ? "analyst" : "analysts"}` : leads.length ? "Leads only" : undefined },
    {
      label: "Open write-ups",
      value:
        soonest && soonestTicker ? (
          <Link href={movementHref(scopeSlug, scopeFor(scopeSlug, team.slug), soonest.id)} className="hover:underline">
            {overdue.length ? `${overdue.length} overdue` : `${open.length} open`}
          </Link>
        ) : overdue.length ? (
          `${overdue.length} overdue`
        ) : open.length ? (
          `${open.length} open`
        ) : (
          "None open"
        ),
      tone: overdue.length ? "down" : undefined,
      note: soonest && soonestTicker ? `${soonestTicker}, due ${fmtDateTime(soonest.dueAt!)}` : "Nothing owed",
    },
    { label: "Next report", value: next ? `${next.ticker}, ${fmtDayMonth(next.reportDate)}` : "None scheduled", note: next ? (next.estimated ? "Estimated date" : "Confirmed date") : "Dates refresh every morning" },
  ];

  return (
    <section aria-labelledby="rail-team" className="rounded-xl bg-surface p-4">
      <h2 id="rail-team" className="mb-1 text-body font-semibold">
        {team.name}
      </h2>
      <dl>
        {facts.map((f) => (
          <div key={f.label} className="grid grid-cols-[104px_minmax(0,1fr)] gap-x-3 border-b border-row py-2 last:border-b-0">
            <dt className="text-caption text-muted-foreground">{f.label}</dt>
            <dd className="min-w-0">
              <div className={cn("text-body font-medium", f.tone === "down" && "text-down")}>{f.value}</div>
              {f.note && <div className="text-caption text-muted-foreground">{f.note}</div>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Read once per request; a helper so the render stays free of impure calls. */
function nowMs() {
  return Date.now();
}
