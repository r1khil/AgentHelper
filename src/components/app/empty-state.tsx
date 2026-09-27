import { cn } from "@/lib/utils";
import type { HootMood } from "@/lib/hoot/types";
import { HootSprite } from "@/components/app/hoot/hoot-sprite";
import { HootOnPage } from "@/components/app/hoot/presence";

export function EmptyState({
  title,
  children,
  className,
  action,
  hoot,
}: {
  title: string;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  /** Show Hoot above the message, e.g. "sleepy" for nothing-yet, "happy" for all-done. */
  hoot?: HootMood;
}) {
  return (
    <div className={cn("rounded-[14px] border border-dashed px-6 py-10 text-center", className)}>
      {/* The one Hoot on the page: the corner companion steps aside while this shows. */}
      {hoot && <HootOnPage />}
      {hoot && <HootSprite mood={hoot} size={88} track bob className="mx-auto mb-3" />}
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
