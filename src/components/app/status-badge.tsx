import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, dueAt }: { status: "open" | "in_progress" | "completed" | "upcoming" | "reported" | "reviewed"; dueAt?: Date | null }) {
  const overdue = status !== "completed" && isPast(dueAt);
  const label = overdue ? "Overdue" : { open: "Open", in_progress: "In progress", completed: "Completed", upcoming: "Upcoming", reported: "Reported", reviewed: "Reviewed" }[status];
  return (
    <Badge
      variant="outline"
      className={cn(
        overdue && "border-down/40 bg-down/10 text-down",
        !overdue && status === "completed" && "border-up/40 bg-up/10 text-up",
        !overdue && status === "reviewed" && "border-up/40 bg-up/10 text-up",
        !overdue && status === "in_progress" && "border-warning/50 bg-warning/10 text-warning-foreground",
      )}
    >
      {label}
    </Badge>
  );
}

function isPast(d?: Date | null) {
  return Boolean(d && d.getTime() < Date.now());
}
