import { cn } from "@/lib/utils";
import { toneClass, type Tone } from "./parts";

/**
 * The headline a Portfolio view opens with, under the page's own hero: a grey label, the view's one figure (22px,
 * coloured by sign when it is a gain or a loss) and the line under it, the `change` in ink then the grey `note`, which
 * brings its own leading punctuation (", S&P 500 +0.4%"). `aside` sits at the right, level with the line: a data note
 * or a switch.
 */
export function Hero({ label, value, tone, change, note, aside }: { label: React.ReactNode; value: React.ReactNode; tone?: Tone; change?: React.ReactNode; note?: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-end gap-10">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-body text-muted-foreground">{label}</span>
        <span className={cn("figure text-display", toneClass(tone))}>{value}</span>
        {(change || note) && (
          <span className="text-body">
            {change && <span className="font-semibold">{change}</span>}
            {note && <span className="text-muted-foreground">{note}</span>}
          </span>
        )}
      </div>
      {aside}
    </div>
  );
}
