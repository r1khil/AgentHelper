import { cn } from "@/lib/utils";

/** Up, down or neither, read off a figure as it is written: "(0.54%)" is down, "+1.12%" up, a value that rounds to zero neither. */
export function toneOfText(text: string): "up" | "down" | null {
  if (text.startsWith("(")) return "down";
  return /[1-9]/.test(text) && text !== "—" ? "up" : null;
}

const TONE = { up: "text-up", down: "text-down" } as const;

/**
 * A change written in accounting style, green when up and red when down. Text only: the caller formats it. `align`
 * keeps a right-aligned column of mixed signs on its digits, the way a negative's closing parenthesis hangs.
 */
export function Delta({ text, className, weight = "semibold", align }: { text: string; className?: string; weight?: "normal" | "medium" | "semibold"; align?: boolean }) {
  const tone = toneOfText(text);
  return (
    <span className={cn(tone && TONE[tone], weight === "medium" && "font-medium", weight === "semibold" && "font-semibold", className)}>
      {text}
      {align && !text.endsWith(")") && text !== "—" && (
        <span className="invisible" aria-hidden>
          )
        </span>
      )}
    </span>
  );
}
