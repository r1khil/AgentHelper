"use client";

import { useId } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ReadAs } from "../read-as";

/**
 * The definition as text, for screen readers: the trigger's description points at it. `hidden` keeps it off screen
 * and out of the name of whatever it sits in (a column header is still read as "Return"); the tooltip shows the same
 * words to sighted readers who hover or focus.
 */
function Definition({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span id={id} hidden>
      {children}
    </span>
  );
}

/** Small "i" beside a label. Opens on hover, keyboard focus, or tap; screen readers hear the definition as its description. */
export function InfoTip({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  const id = useId();
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          aria-label={`About ${label}`}
          aria-describedby={id}
          className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring", className)}
        >
          <Info className="size-3.5" aria-hidden />
        </TooltipTrigger>
        <TooltipContent className="block max-w-72 text-left leading-relaxed font-normal whitespace-normal normal-case">{children}</TooltipContent>
      </Tooltip>
      <Definition id={id}>{children}</Definition>
    </>
  );
}

/**
 * A label that is its own explainer, for table headers and section titles (the same look as `Tip`: no icon, a dotted
 * underline on hover). `readAs` spells out an abbreviated label for screen readers.
 */
export function Explained({ label, readAs, children }: { label: string; readAs?: string; children: React.ReactNode; align?: "left" | "right" }) {
  return <Tip label={readAs ? <ReadAs text={readAs}>{label}</ReadAs> : label}>{children}</Tip>;
}

/**
 * A label that is its own explainer: no icon, so headers stay as clean as the design, but hovering, focusing or
 * tapping it opens the definition. A dotted underline appears on hover so it reads as explainable. Screen readers
 * hear the definition as the label's description.
 */
export function Tip({ label, children, className, side = "top" }: { label: React.ReactNode; children: React.ReactNode; className?: string; side?: "top" | "bottom" }) {
  const id = useId();
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={<span tabIndex={0} />}
          aria-describedby={id}
          className={cn(
            "cursor-help rounded-sm underline decoration-transparent decoration-dotted underline-offset-[3px] outline-none hover:decoration-muted-foreground/60 focus-visible:decoration-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          {label}
        </TooltipTrigger>
        <TooltipContent side={side} className="block max-w-72 text-left leading-relaxed font-normal tracking-normal whitespace-normal normal-case">{children}</TooltipContent>
      </Tooltip>
      <Definition id={id}>{children}</Definition>
    </>
  );
}
