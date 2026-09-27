import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Research › Conversations: three columns (288px list · the conversation · 312px sources) filling the content area
 * edge to edge. Children are the three column elements below, so a client component can own the last two
 * (the thread and its sources share state) while the list stays mounted across chat switches.
 */
export function ResearchGrid({ children }: { children: ReactNode }) {
  return (
    <div data-full-bleed className="grid min-h-0 flex-1 grid-cols-1 lg:h-[calc(100dvh-3.5rem)] lg:grid-cols-[288px_minmax(0,1fr)_312px] lg:overflow-hidden">
      {children}
    </div>
  );
}

export function ListColumn({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 flex-col gap-4 border-b px-3 py-4 lg:border-r lg:border-b-0">{children}</div>;
}

export function CenterColumn({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("flex min-h-[560px] min-w-0 flex-col bg-card lg:min-h-0", className)}>{children}</section>;
}

export function SideColumn({ children }: { children: ReactNode }) {
  return <aside className="flex min-h-0 min-w-0 flex-col border-t px-3.5 py-4 lg:border-t-0 lg:border-l">{children}</aside>;
}
