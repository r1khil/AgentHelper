import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  children,
  className,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border border-dashed px-6 py-10 text-center", className)}>
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
