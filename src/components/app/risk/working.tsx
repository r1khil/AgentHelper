import { cn } from "@/lib/utils";

/**
 * Transparency mode: a disclosure under a number that shows its formula with the page's own
 * inputs substituted, step by step, so it can be checked by hand or in a spreadsheet.
 */
export function Working({ title = "Show working", children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <details className={cn("group border-t text-body", className)}>
      <summary className="cursor-pointer py-2 font-semibold text-muted-foreground select-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{title}</summary>
      <div className="grid gap-1.5 border-t border-row bg-band px-3 py-2.5 leading-relaxed">{children}</div>
    </details>
  );
}

/** One line of working: the expression, then its value. */
export function Step({ label, children }: { label?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="tnum">
      {label && <span className="text-muted-foreground">{label} </span>}
      {children}
    </div>
  );
}

export function Source({ children }: { children: React.ReactNode }) {
  return <div className="text-muted-foreground">Source: {children}</div>;
}
