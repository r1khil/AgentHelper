"use client";

import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Small "i" beside a label. Opens on hover, keyboard focus, or tap. */
export function InfoTip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`About ${label}`}
        className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", className)}
      >
        <Info className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent className="block max-w-72 text-left leading-relaxed font-normal whitespace-normal normal-case">{children}</TooltipContent>
    </Tooltip>
  );
}

/** A label followed by its explainer, for table headers and section titles. */
export function Explained({ label, children, align = "left" }: { label: string; children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <span className={cn("inline-flex items-center gap-1", align === "right" && "flex-row-reverse")}>
      {label}
      <InfoTip label={label}>{children}</InfoTip>
    </span>
  );
}

/**
 * A label that is its own explainer: no icon, so headers stay as clean as the design, but hovering, focusing or
 * tapping it opens the definition. A dotted underline appears on hover so it reads as explainable.
 */
export function Tip({ label, children, className, side = "top" }: { label: React.ReactNode; children: React.ReactNode; className?: string; side?: "top" | "bottom" }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span tabIndex={0} />}
        className={cn(
          "cursor-help rounded-sm underline decoration-transparent decoration-dotted underline-offset-[3px] outline-none hover:decoration-muted-foreground/60 focus-visible:decoration-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {label}
      </TooltipTrigger>
      <TooltipContent side={side} className="block max-w-72 text-left leading-relaxed font-normal tracking-normal whitespace-normal normal-case">{children}</TooltipContent>
    </Tooltip>
  );
}
