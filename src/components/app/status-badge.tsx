import { cn } from "@/components/utils";

/**
 * Status must be a LITERAL class lookup, never a constructed string.
 * Tailwind scans source files for literal class names, so
 * `bg-status-${status}-surface` would compile to no CSS at all and render an
 * unstyled badge, silently, in dev and prod alike.
 *
 * Keys mirror the database literals. docs/mvp.md:44 requires investigation,
 * delivery and data-quality status to stay distinguishable; the previous
 * stylesheet collapsed .completed, .done and .captured into one rule.
 */
const INVESTIGATION: Record<string, string> = {
  open: "bg-status-open-surface text-status-open",
  in_progress: "bg-status-in-progress-surface text-status-in-progress",
  completed: "bg-status-completed-surface text-status-completed",
  overdue: "bg-status-overdue-surface text-status-overdue",
};

const JOB: Record<string, string> = {
  pending: "bg-status-pending-surface text-status-pending",
  running: "bg-status-running-surface text-status-running",
  succeeded: "bg-status-succeeded-surface text-status-succeeded",
  done: "bg-status-done-surface text-status-done",
  failed: "bg-status-failed-surface text-status-failed",
  cancelled: "bg-status-cancelled-surface text-status-cancelled",
};

const DELIVERY: Record<string, string> = {
  captured: "bg-status-captured-surface text-status-captured",
  failed: "bg-status-failed-surface text-status-failed",
  pending: "bg-status-pending-surface text-status-pending",
};

const FALLBACK = "bg-status-pending-surface text-status-pending";

const base =
  "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap";

function label(status: string) {
  return status.replaceAll("_", " ");
}

/** Investigation status: open | in_progress | completed (or derived overdue). */
export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span className={cn(base, INVESTIGATION[status] ?? FALLBACK, className)}>
      {label(status)}
    </span>
  );
}

/** Durable job status. Deliberately a separate visual language. */
export function JobBadge({ status }: { status: string }) {
  return <span className={cn(base, JOB[status] ?? FALLBACK)}>{label(status)}</span>;
}

/** Notification delivery status — separate from investigation status. */
export function DeliveryBadge({ status }: { status: string }) {
  return (
    <span className={cn(base, DELIVERY[status] ?? FALLBACK)}>
      {label(status)}
    </span>
  );
}
