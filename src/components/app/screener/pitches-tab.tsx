import { fmtChangePct, fmtDate, fmtNumber, fmtPct, fmtUsd } from "@/lib/format";
import type { CalibrationRow } from "@/lib/screener/calibration";
import { todayNY } from "@/lib/providers/calendar";
import { HoldingLogo } from "@/components/app/holding-logo";
import { RowLink } from "@/components/app/row-link";
import type { loadPitches, ScreenerScope } from "@/app/(app)/screener/load";
import type { ScreenerQuery } from "@/app/(app)/screener/types";
import { companyHref, Lede, ScreenerFrame, Section, StatusWord } from "./parts";
import { pitchState } from "./pitch-state";
import { PitchJump } from "./pitch-jump";

type Data = Awaited<ReturnType<typeof loadPitches>>;

/** About 20 resolved estimates are enough to spot a large optimism bias, not to check that 70% means 70%. */
const ENOUGH_FOR_BIAS = 20;

const COLS = "grid grid-cols-[minmax(0,1.6fr)_96px_96px_88px_72px_minmax(0,1.2fr)] items-center gap-3";

/**
 * Pitches: each one's estimates and what would prove it wrong, newest first, with where it stands. Execs and admins
 * also see calibration: estimates against what happened, by team and by cohort, with the sample size beside each.
 */
export function PitchesTab({ q, scope, data }: { q: ScreenerQuery; scope: ScreenerScope; data: Data }) {
  const today = todayNY();
  const teamName = new Map(scope.teams.map((t) => [t.id, t.name]));
  return (
    <ScreenerFrame q={q} scope={scope}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Lede>Each pitch&apos;s estimates, its one key metric and the conditions that would prove it wrong. The app checks the ones it can read after each filing.</Lede>
        {scope.manageable.length > 0 && <PitchJump />}
      </div>

      <div role="table" aria-label="Pitches" className="mt-5 text-body">
        <div role="row" className={`${COLS} h-10 border-b text-caption text-muted-foreground`}>
          <span role="columnheader">Company</span>
          <span role="columnheader" className="text-right">Value / share</span>
          <span role="columnheader" className="text-right">Target</span>
          <span role="columnheader" className="text-right" title="Confidence the price reaches the target within the horizon">
            Confidence
          </span>
          <span role="columnheader" className="text-right">Horizon</span>
          <span role="columnheader" className="pl-4">
            Where it stands
          </span>
        </div>
        {data.pitches.length === 0 && (
          <div role="row" className="border-b py-4 text-muted-foreground">
            <span role="cell">No pitches recorded yet. Record one from a company&apos;s page, under Pitch.</span>
          </div>
        )}
        {data.pitches.map((p) => {
          const state = pitchState(p, today);
          return (
            <div key={p.id} role="row" className={`${COLS} relative min-h-12 border-b border-row py-1.5 transition-colors hover:bg-band`}>
              <span role="rowheader" className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)] items-center gap-x-2.5">
                <HoldingLogo ticker={p.ticker} size={20} className="row-span-2" />
                <RowLink cover="stretch" href={companyHref(p.ticker, "pitch")} className="truncate font-semibold">
                  {p.ticker}
                </RowLink>
                <span className="truncate text-caption text-muted-foreground">
                  {[teamName.get(p.teamId), fmtDate(p.pitchedOn), p.cohort].filter(Boolean).join(", ")}
                </span>
              </span>
              <span role="cell" className="text-right tabular-nums">
                {fmtUsd(p.intrinsicValue)}
              </span>
              <span role="cell" className="text-right tabular-nums">
                {fmtUsd(p.priceTarget)}
                {p.priceAtPitch ? <span className="block text-caption text-muted-foreground">{fmtChangePct((p.priceTarget / p.priceAtPitch - 1) * 100, 0)}</span> : null}
              </span>
              <span role="cell" className="text-right tabular-nums">
                {fmtPct(p.confidence, 0)}
              </span>
              <span role="cell" className="text-right tabular-nums">
                {p.horizonMonths} mo
              </span>
              <span role="cell" className="min-w-0 truncate pl-4">
                <StatusWord tone={state.tone} title={state.title}>
                  {state.word}
                </StatusWord>
                <span className="block truncate text-caption text-muted-foreground" title={p.keyMetric}>
                  {p.keyMetric}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {data.calibration && <Calibration rows={data.calibration} teamName={teamName} />}
    </ScreenerFrame>
  );
}

function Calibration({ rows, teamName }: { rows: NonNullable<Data["calibration"]>; teamName: Map<string, string> }) {
  const n = rows.overall.n;
  const note =
    n === 0
      ? "Nothing to score yet: a pitch is scored when its horizon ends. It takes two or three semesters of pitches before this says anything reliable."
      : n < ENOUGH_FOR_BIAS
        ? `${fmtNumber(n)} resolved ${n === 1 ? "pitch" : "pitches"}. Too few to judge any bias yet; about ${ENOUGH_FOR_BIAS} can show a large one.`
        : `${fmtNumber(n)} resolved pitches: enough to spot a large optimism bias, not to check that 70% confidence means 70%.`;
  return (
    <Section id="calibration-h" title="Calibration" className="mt-12">
      <p className="mt-1 max-w-[72ch] text-body text-ink-2">{note}</p>
      <CalibrationTable label="By team" rows={rows.byTeam.map((r) => ({ ...r, name: teamName.get(r.key) ?? "Team" }))} />
      <CalibrationTable label="By cohort" rows={rows.byCohort.map((r) => ({ ...r, name: r.key }))} />
      <p className="mt-3 max-w-[72ch] text-caption text-muted-foreground">
        Hit rate: the price reached the target within the horizon. Thesis: the key metric landed, where code can check it. Optimism: estimated value against the price at the horizon; above zero means estimates ran high. Scored by team, never by person.
      </p>
    </Section>
  );
}

const CAL = "grid grid-cols-[minmax(0,1fr)_64px_88px_96px_96px] items-center gap-3";

function CalibrationTable({ label, rows }: { label: string; rows: (CalibrationRow & { name: string })[] }) {
  if (!rows.length) return null;
  return (
    <div role="table" aria-label={`Calibration ${label.toLowerCase()}`} className="mt-4 text-body">
      <div role="row" className={`${CAL} h-10 border-b text-caption text-muted-foreground`}>
        <span role="columnheader">{label}</span>
        <span role="columnheader" className="text-right">
          Scored
        </span>
        <span role="columnheader" className="text-right">
          Hit rate
        </span>
        <span role="columnheader" className="text-right">
          Thesis
        </span>
        <span role="columnheader" className="text-right">
          Optimism
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.key} role="row" className={`${CAL} min-h-10 border-b border-row`}>
          <span role="rowheader" className="truncate font-semibold">
            {r.name}
          </span>
          <span role="cell" className="text-right tabular-nums">
            {r.n}
          </span>
          <span role="cell" className="text-right tabular-nums">
            {r.hitRate === null ? "—" : fmtPct(r.hitRate * 100, 0)}
          </span>
          <span role="cell" className="text-right tabular-nums" title={r.thesisN ? `${r.thesisN} checkable` : "No key metric code could check"}>
            {r.thesisAccuracy === null ? "—" : fmtPct(r.thesisAccuracy * 100, 0)}
          </span>
          <span role="cell" className="text-right tabular-nums">
            {r.optimism === null ? "—" : fmtChangePct(r.optimism * 100, 0)}
          </span>
        </div>
      ))}
    </div>
  );
}

