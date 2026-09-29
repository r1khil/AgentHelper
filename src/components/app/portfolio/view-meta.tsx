import { cn } from "@/lib/utils";

/**
 * A view's own line under the Portfolio's view control: what its figures are as of, in grey, and the view's actions
 * (Export CSV, the layout switch) on the right. The page header above belongs to the whole Portfolio.
 */
export function ViewMeta({ children, actions, className }: { children?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-5 flex min-h-[30px] items-center gap-3", className)}>
      <div className="min-w-0 flex-1 truncate text-caption text-muted-foreground">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
