import { SECTOR_LABELS } from "@/lib/attribution/sectors";
import { fmtDate, fmtUsdCompact } from "@/lib/format";
import { RailCard, RailRow } from "@/components/app/rail-card";
import type { loadCompany } from "@/app/(app)/screener/[ticker]/load";
import { StatusWord } from "../parts";
import { WatchButton } from "./watch-button";

type Company = NonNullable<Awaited<ReturnType<typeof loadCompany>>>;

/** A company's rail: where it stood in the latest screen, and which teams hold it or watch it. */
export function CompanyRail({ c, manageable }: { c: Company; manageable: { id: string; name: string }[] }) {
  const watchedBy = new Set(c.watched.map((w) => w.teamId));
  const canWatch = manageable.filter((t) => !watchedBy.has(t.id) && !c.held.some((h) => h.teamId === t.id));
  return (
    <aside aria-label={`${c.ticker} in the fund`} className="flex w-[300px] shrink-0 flex-col gap-[18px]">
      <RailCard id="company-screen" title="In the screen" note={c.hit ? undefined : "Not among this month's top 100. The screen covers NYSE and Nasdaq companies above $3B."}>
        {c.hit && (
          <>
            <RailRow label="Run">{c.hitRunDate ? fmtDate(c.hitRunDate) : "—"}</RailRow>
            <RailRow label="Rank">{c.hit.teamRank ? `${c.hit.teamRank} for the team, ${c.hit.rank} overall` : `${c.hit.rank} overall`}</RailRow>
            <RailRow label="Track">{c.hit.track === "garp" ? "GARP" : "Value"}</RailRow>
            {c.hit.sector && <RailRow label="Sector">{SECTOR_LABELS[c.hit.sector]}</RailRow>}
            {c.hit.marketCap && <RailRow label="Market cap">{fmtUsdCompact(c.hit.marketCap)}</RailRow>}
          </>
        )}
      </RailCard>
      <RailCard id="company-follow" title="In the fund">
        {c.held.map((h) => (
          <RailRow key={`h-${h.teamId}`} label={h.name}>
            <StatusWord tone="ink">Holding</StatusWord>
          </RailRow>
        ))}
        {c.watched.map((w) => (
          <RailRow key={`w-${w.id}`} label={w.name}>
            <StatusWord>Watching</StatusWord>
          </RailRow>
        ))}
        {!c.held.length && !c.watched.length && <p className="py-1 text-body text-muted-foreground">No team holds or watches it.</p>}
        {canWatch.length > 0 && <WatchButton ticker={c.ticker} teams={canWatch} />}
      </RailCard>
    </aside>
  );
}
