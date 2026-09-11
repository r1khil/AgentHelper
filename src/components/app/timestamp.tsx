import { DateTime } from "luxon";
import { cn } from "@/components/utils";

/**
 * Server component on purpose. This is the only luxon consumer in the
 * presentation layer; making it a client component would ship timezone data
 * to the browser and open a hydration-mismatch vector.
 */
const ZONE = "America/New_York";

export type DueState = "overdue" | "soon" | "later" | "none";

/** Deadline urgency, so an overdue item cannot look like one due next week. */
export function dueState(value: Date | string | null): DueState {
  if (!value) return "none";
  const due = DateTime.fromJSDate(new Date(value)).setZone(ZONE);
  const hours = due.diffNow("hours").hours;
  if (hours < 0) return "overdue";
  if (hours < 24) return "soon";
  return "later";
}

const TONE: Record<DueState, string> = {
  overdue: "text-status-overdue font-semibold",
  soon: "text-status-open font-semibold",
  later: "",
  none: "text-muted-foreground",
};

export function Timestamp({
  value,
  due,
  absent = "—",
  className,
}: {
  value: Date | string | null;
  /** Colour by deadline urgency and append a relative hint. */
  due?: boolean;
  /** What to render when there is simply no date. */
  absent?: string;
  className?: string;
}) {
  if (!value) {
    return <span className={cn("text-muted-foreground", className)}>{absent}</span>;
  }

  const dt = DateTime.fromJSDate(new Date(value)).setZone(ZONE);
  const state = dueState(value);

  return (
    <span
      className={cn("tabular-nums", due ? TONE[state] : undefined, className)}
      title={dt.toFormat("cccc, LLLL d yyyy, h:mm a ZZZZ")}
    >
      {dt.toFormat("MMM d, h:mm a")}
      {due && state === "overdue" && (
        <span className="ml-1.5 text-[11px] font-semibold">overdue</span>
      )}
    </span>
  );
}
