import { cn } from "@/components/utils";

export function EmptyState({
  title,
  children,
  className,
}: {
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border text-muted-foreground rounded-lg border border-dashed px-5 py-8 text-center text-[13px]",
        className,
      )}
    >
      {title && (
        <div className="text-foreground mb-1 font-serif text-base">{title}</div>
      )}
      {children}
    </div>
  );
}
