import { cn } from "@/components/utils";

/**
 * Compact by design. The previous heading block ran a serif display line and
 * a tagline that together ate the top third of every screen while saying
 * nothing an analyst needed -- the first open investigation sat below the
 * fold.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-border mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b pb-4",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-muted-foreground mb-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
            {eyebrow}
          </div>
        )}
        <h1 className="font-serif text-[26px] leading-tight tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-1 mb-0 text-[13px]">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-3">{children}</div>
      )}
    </div>
  );
}
