import { fmtChangePct, fmtDate, fmtPct, fmtUsd } from "@/lib/format";
import { CHECKABLE_METRICS, horizonEnd, isCheckable } from "@/lib/screener/calibration";
import type { PitchView } from "@/lib/screener/pitches";
import { todayNY } from "@/lib/providers/calendar";
import { StatusWord } from "../parts";
import { pitchState } from "../pitch-state";
import { PitchForm } from "./pitch-form";

/**
 * The team's pitch on this company: what it estimated, the one metric the thesis depends on, and the kill criteria,
 * each marked as checked by code (after each filing) or as a quarterly review prompt. Record a new one below.
 */
export function PitchTab({ ticker, pitches, teams, defaultTeamId, teamName }: { ticker: string; pitches: PitchView[]; teams: { id: string; name: string }[]; defaultTeamId: string | null; teamName: Record<string, string> }) {
  const today = todayNY();
  return (
    <div>
      {pitches.length === 0 && <p className="max-w-[72ch] text-body text-ink-2">No pitch recorded for {ticker}. Record the team&apos;s estimates and what would prove them wrong; the app checks what it can after each filing and scores the pitch when its horizon ends.</p>}
      <ol className="flex max-w-[760px] flex-col gap-9">
        {pitches.map((p) => {
          const state = pitchState(p, today);
          return (
            <li key={p.id}>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 className="text-body font-semibold">
                  {teamName[p.teamId] ?? "Team"}, {fmtDate(p.pitchedOn)}
                </h2>
                <StatusWord tone={state.tone} title={state.title}>
                  {state.word}
                </StatusWord>
                <span className="text-caption text-muted-foreground">{p.cohort}</span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-8 text-body">
                <Row label="Intrinsic value / share" value={fmtUsd(p.intrinsicValue)} />
                <Row label="Price at pitch" value={p.priceAtPitch === null ? "—" : fmtUsd(p.priceAtPitch)} />
                <Row label="Price target" value={`${fmtUsd(p.priceTarget)}${p.priceAtPitch ? `, ${fmtChangePct((p.priceTarget / p.priceAtPitch - 1) * 100, 0)}` : ""}`} />
                <Row label="Horizon" value={`${p.horizonMonths} months, to ${fmtDate(horizonEnd(p.pitchedOn, p.horizonMonths))}`} />
                <Row label="Confidence" value={fmtPct(p.confidence, 0)} />
                <Row label="Key metric" value={p.keyMetric} />
              </dl>
              {p.outcome && (
                <p className="mt-2 text-caption text-muted-foreground">
                  Scored {fmtDate(p.outcome.scoredAt)}: {p.outcome.hitTarget === null ? "no prices" : p.outcome.hitTarget ? "reached the target" : "didn't reach the target"}
                  {p.outcome.priceAtHorizon !== null ? `, ${fmtUsd(p.outcome.priceAtHorizon)} at the horizon` : ""}
                  {p.outcome.keyMetricMet !== null ? `, key metric ${p.outcome.keyMetricMet ? "landed" : "missed"}` : ""}.
                </p>
              )}
              <h3 className="mt-4 text-caption text-muted-foreground">Kill criteria</h3>
              <ul className="mt-1">
                {p.killCriteria.map((c, i) => (
                  <li key={i} className="flex min-h-9 items-baseline justify-between gap-3 border-b border-row py-1.5 text-body">
                    <span className="min-w-0">{c.text}</span>
                    {isCheckable(c) ? (
                      c.tripped ? (
                        <StatusWord tone="caution" title={c.lastChecked ? `Checked ${fmtDate(c.lastChecked)}` : undefined}>
                          Met
                        </StatusWord>
                      ) : (
                        <StatusWord title={`${CHECKABLE_METRICS[c.metric].label}, checked by code${c.lastChecked ? ` ${fmtDate(c.lastChecked)}` : ""}`}>{c.lastChecked ? "Not met" : "Checked after filings"}</StatusWord>
                      )
                    ) : (
                      <StatusWord title="Code can't read this one; it comes up in the team's quarterly review">Quarterly review</StatusWord>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
      {teams.length > 0 && <PitchForm ticker={ticker} teams={teams} defaultTeamId={defaultTeamId} first={pitches.length === 0} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[34px] items-center justify-between gap-3 border-b border-row">
      <dt className="shrink-0 text-ink-2">{label}</dt>
      <dd className="min-w-0 truncate text-right tabular-nums" title={value}>
        {value}
      </dd>
    </div>
  );
}
