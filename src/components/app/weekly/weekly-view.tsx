import { buildWeeklyNow } from "@/lib/actions/weekly";
import { EmptyState } from "@/components/app/empty-state";
import { PageHead } from "@/components/app/page-head";
import { RowLink } from "@/components/app/row-link";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fmtDay, fmtDayMonth } from "@/lib/format";
import { todayNY } from "@/lib/providers/calendar";
import { packText } from "@/lib/weekly/format";
import { scheduledSendAt } from "@/lib/weekly/status";
import { cn } from "@/lib/utils";
import { PackActions } from "./pack-actions";
import { WeeklyPack } from "./weekly-pack";
import type { PackListItem, WeeklyPackProps } from "./types";

export type WeeklyViewProps = {
  packs: PackListItem[];
  /** The week shown on the right: the latest pack on /weekly, the URL's week on /weekly/[week]. */
  selected: string | null;
  pack: WeeklyPackProps | null;
  notice: { ok?: string; error?: string };
  /** The Friday that just passed, which the Sunday job builds; offered as a build when it has no pack yet. */
  target: { week: string; label: string; exists: boolean };
};

/** What the packs list says under a week, in words: whether it was built, and what happened to its email. */
function packLine(p: PackListItem): { text: string; caution: boolean } {
  if (p.state === "sent") return { text: p.status === "sent" ? "Built · sent · locked" : "Built · sent", caution: false };
  if (p.state === "failed") return { text: "Built · send failed", caution: true };
  if (p.state === "scheduled") return { text: `Built · sends ${fmtDateTime(scheduledSendAt(p.weekEnding).toJSDate())}`, caution: false };
  return { text: p.listPaused ? "Built · not sent (list paused)" : "Built · not sent", caution: true };
}

/** The packs list beside the selected pack. Both /weekly routes render this. */
export function WeeklyView({ packs, selected, pack, notice, target }: WeeklyViewProps) {
  const noticeEl = (notice.ok || notice.error) && (
    <div role="status" className={cn("mb-4 text-body font-medium", notice.error ? "text-caution-foreground" : "text-foreground")}>
      {notice.error ?? notice.ok}
    </div>
  );
  const buildForm = (week: string | null, label: string, primary = true) => (
    <form action={buildWeeklyNow}>
      {week && <input type="hidden" name="week" value={week} />}
      <Button type="submit" variant={primary ? "default" : "secondary"}>
        {label}
      </Button>
    </form>
  );
  const head = (
    <PageHead
      crumbs={[{ label: "Manage" }, { label: "Weekly update" }]}
      asof="Execs and admins"
      tabs={false}
      actions={
        pack ? (
          <PackActions
            week={pack.weekEnding}
            locked={pack.status === "sent"}
            state={pack.state}
            email={pack.email}
            whole={packText({ weekEnding: pack.weekEnding, figures: pack.figures, performers: pack.performers, agenda: pack.agenda, lastWeekAgenda: pack.lastWeekAgenda })}
          />
        ) : null
      }
    />
  );

  if (packs.length === 0 && !selected) {
    return (
      <>
        {head}
        {noticeEl}
        <EmptyState title="No packs yet" hoot="sleepy" action={buildForm(null, `Build pack for ${target.label}`)}>
          Every Sunday at 12:00 New York the app builds the pack for the Friday that just passed — the week&apos;s best and worst performers, the coming week&apos;s earnings and
          economic releases, and last week&apos;s agenda rolled forward — then Hoot emails it to Aadi, with Saad in CC. Build the first one now, or wait for Sunday.
        </EmptyState>
      </>
    );
  }

  // The Friday that just passed has no pack until the Sunday job builds it: list it first, so it can be opened and built by hand.
  const pending = !target.exists && packs[0]?.weekEnding !== target.week;
  const sunday = scheduledSendAt(target.week);
  // The Sunday job still has to run when Sunday is today or ahead.
  const sundayAhead = sunday.toISODate()! >= todayNY();
  const listed: { weekEnding: string; line: { text: string; caution: boolean } }[] = [
    ...(pending ? [{ weekEnding: target.week, line: { text: sundayAhead ? `Not built yet · builds ${fmtDay(sunday.toJSDate())}` : "Not built yet", caution: false } }] : []),
    ...packs.map((p) => ({ weekEnding: p.weekEnding, line: packLine(p) })),
  ];

  return (
    <div data-full-bleed className="flex min-h-0 flex-1 flex-col">
      {head}
      <div className="flex min-h-0 flex-1">
        <aside data-tour="weekly-packs" aria-label="Packs" className="w-60 shrink-0 border-r pt-[18px] pr-4 pl-10">
          {listed.map((p) => {
            const on = p.weekEnding === selected;
            return (
              <RowLink
                key={p.weekEnding}
                href={`/weekly/${p.weekEnding}`}
                aria-current={on ? "page" : undefined}
                className="flex flex-col border-b border-row py-[9px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
              >
                <span className={cn("text-body", on ? "font-semibold" : "text-ink-3")}>Week ended {fmtDayMonth(p.weekEnding)}</span>
                <span className={cn("text-caption", p.line.caution ? "text-caution-foreground" : "text-muted-foreground")}>{p.line.text}</span>
              </RowLink>
            );
          })}
          <p className="mt-3 text-caption text-muted-foreground">A pack builds every Sunday at 12:00 New York.</p>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col px-8 pt-6 pb-24">
          {noticeEl}
          {pack ? (
            <WeeklyPack key={pack.weekEnding} {...pack} />
          ) : selected ? (
            <div className="flex max-w-md flex-col items-start gap-3">
              <span className="text-body text-muted-foreground">Week ended {fmtDay(selected)}</span>
              <span className="hero-figure">Not built yet</span>
              <span className="text-emph text-muted-foreground">
                {selected === target.week && sundayAhead ? `The Sunday job builds it on ${fmtDay(sunday.toJSDate())} at 12:00 PM ET. ` : ""}Build it now to see the week&apos;s performers, agenda and email.
              </span>
              {buildForm(selected, "Build this pack")}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
