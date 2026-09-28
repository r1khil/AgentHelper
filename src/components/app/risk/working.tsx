import { cn } from "@/lib/utils";

/**
 * Transparency mode: a disclosure under a number that shows its formula with the page's own
 * inputs substituted, step by step, so it can be checked by hand or in a spreadsheet.
 */
export function Working({ title = "Show working", children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <details className={cn("group rounded-md border border-dashed bg-muted/20 text-body", className)}>
      <summary className="cursor-pointer px-2.5 py-1.5 font-medium text-muted-foreground select-none hover:text-foreground">{title}</summary>
      <div className="grid gap-1.5 border-t border-dashed px-2.5 py-2 leading-relaxed">{children}</div>
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
