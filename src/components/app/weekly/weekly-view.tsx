import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { buildWeeklyNow } from "@/lib/actions/weekly";
import { EmptyState } from "@/components/app/empty-state";
import { Panel, PanelFooter, PanelHeader, Pill } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { fmtDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { WeeklyPack } from "./weekly-pack";
import { whenBuilt } from "./when";
import type { PackListItem, WeeklyPackProps } from "./types";

const short = (iso: string) => fmtDay(iso);

export type WeeklyViewProps = {
  packs: PackListItem[];
  /** The week shown on the right: the latest pack on /weekly, the URL's week on /weekly/[week]. */
  selected: string | null;
  pack: WeeklyPackProps | null;
  notice: { ok?: string; error?: string };
  /** The Friday that just passed, which the Sunday job builds; offered as a build when it has no pack yet. */
  target: { week: string; label: string; exists: boolean };
};

/** S10: packs list on the left, the selected pack on the right. Both /weekly routes render this. */
export function WeeklyView({ packs, selected, pack, notice, target }: WeeklyViewProps) {
  const noticeEl = (notice.ok || notice.error) && (
    <div role="status" className={cn("shrink-0 rounded-[10px] px-3.5 py-2 text-[13px]", notice.error ? "bg-caution text-caution-foreground" : "bg-good text-good-foreground")}>
      {notice.error ?? notice.ok}
    </div>
  );
  const buildForm = (week: string | null, label: string, primary = true) => (
    <form action={buildWeeklyNow}>
      {week && <input type="hidden" name="week" value={week} />}
      <Button type="submit" variant={primary ? "default" : "outline"}>
        <CalendarRange data-icon="inline-start" />
        {label}
      </Button>
    </form>
  );

  if (packs.length === 0 && !selected) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        {noticeEl}
        <EmptyState title="No packs yet" hoot="sleepy" action={buildForm(null, `Build pack for ${target.label}`)}>
          Every Sunday at 12:00 New York the app builds the pack for the Friday that just passed — the week&apos;s best and worst performers, the coming week&apos;s earnings and
          economic releases, and last week&apos;s agenda rolled forward — then Hoot emails it to Aadi, with Saad in CC. Build the first one now, or wait for Sunday.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Panel data-tour="weekly-packs" className="lg:max-h-[calc(100dvh-104px)] lg:self-stretch">
        <PanelHeader title="Packs" aside="Every Sunday 12:00" className="px-3.5" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {packs.map((p) => {
            const on = p.weekEnding === selected;
            const sent = p.status === "sent";
            const emailed = !sent && Boolean(p.emailedAt);
            const meta = sent
              ? `Sent ${short(p.sentAt ?? p.emailedAt ?? p.weekEnding)}`
              : emailed
                ? `Emailed ${short(p.emailedAt!)}`
                : p.builtAt
                  ? `Built ${whenBuilt(p.builtAt)}`
                  : "Not built yet";
            return (
              <Link
                key={p.weekEnding}
                href={`/weekly/${p.weekEnding}`}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 border-b border-row px-3.5 py-2.5 transition-colors hover:bg-band focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                  on && "bg-band shadow-[inset_3px_0_0_var(--foreground)]",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">Week ending {short(p.weekEnding)}</div>
                  <div className="mt-px truncate text-xs text-muted-foreground">{meta}</div>
                </div>
                {sent ? <Pill>Sent</Pill> : emailed ? <Pill title="The Sunday email went out; the pack is still an open draft">Emailed</Pill> : <Pill tone="hoot">Draft</Pill>}
              </Link>
            );
          })}
        </div>
        {!target.exists && <PanelFooter className="justify-center py-3">{buildForm(null, `Build pack for ${short(target.week)}`, false)}</PanelFooter>}
      </Panel>

      <div className="flex min-h-0 min-w-0 flex-col gap-5">
        {noticeEl}
        {pack ? (
          <WeeklyPack key={pack.weekEnding} {...pack} />
        ) : selected ? (
          <Panel className="flex-1 items-center justify-center p-10 text-center">
            <div className="text-[15px] font-semibold">Week ending {fmtDay(selected)}</div>
            <p className="mx-auto mt-1 mb-4 max-w-md text-[13.5px] text-muted-foreground">This pack has not been built yet.</p>
            {buildForm(selected, "Build this pack")}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
