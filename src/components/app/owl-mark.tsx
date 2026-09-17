import { cn } from "@/lib/utils";

export function OwlMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-md bg-primary text-primary-foreground text-xs font-bold tracking-tight",
        className,
      )}
      aria-hidden
    >
      OF
    </div>
  );
}
