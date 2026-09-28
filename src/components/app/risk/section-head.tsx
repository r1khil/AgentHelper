import { cn } from "@/lib/utils";

/** Heading for a section below the fold on Risk and Exposure: a 14.5px title and a muted meta line on the right. */
export function SectionHead({ children, aside, className }: { children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1", className)}>
      <h2 className="text-emph font-semibold">{children}</h2>
      {aside && <div className="text-body text-muted-foreground">{aside}</div>}
    </div>
  );
}
