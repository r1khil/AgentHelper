import { Pill, type PillTone } from "@/components/app/panel";
import { PACK_STATUS_LABELS, type PackStatus } from "@/lib/weekly/status";

const TONES: Record<PackStatus, PillTone> = { draft: "hoot", scheduled: "info", sent: "neutral", failed: "caution" };

/** A weekly pack's status, in the same words and colours on the packs list and the Email tab. */
export function PackStatusPill({ state, title, className }: { state: PackStatus; title?: string; className?: string }) {
  return (
    <Pill tone={TONES[state]} title={title} className={className}>
      {PACK_STATUS_LABELS[state]}
    </Pill>
  );
}
