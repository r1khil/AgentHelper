import { cn } from "@/lib/utils";

// The pieces the four Portfolio analytics pages (Performance, Risk, Exposure, Backtesting) share: the big number that
// opens a page, a section's heading, the footnote, and the small bars. Hairlines, not boxes.

export type Tone = "up" | "down" | null | undefined;
export const toneClass = (t: Tone) => (t === "up" ? "text-up" : t === "down" ? "text-down" : undefined);

/** Up, down or none for a figure as it will be shown: `scale` is the units per shown digit (10_000 for bp of a fraction). */
export function signTone(v: number | null | undefined, scale = 1): Tone {
  if (v === null || v === undefined) return null;
  const n = Math.round(v * scale);
  return n > 0 ? "up" : n < 0 ? "down" : null;
}

/** `+12.3` / `(12.3)` / `0.0` without a unit, for a column whose header says "bp". */
export function plainChange(text: string, v: number | null | undefined) {
  return v !== null && v !== undefined && v > 0 && /[1-9]/.test(text) ? `+${text}` : text;
}

/** A figure already formatted in accounting style, coloured by what it says: "(40 bp)" red, "+12 bp" or "1.2%" green, a zero grey. */
export function Signed({ text, className, role }: { text: string; className?: string; role?: "cell" }) {
  const tone = text === "—" || text === "" ? "text-muted-foreground" : text.startsWith("(") ? "text-down" : /[1-9]/.test(text) ? "text-up" : "text-muted-foreground";
  return <span role={role} className={cn(tone, className)}>{text}</span>;
}

/** A part of the hero's line that carries the weight: ink and semibold among the grey. */
export function Strong({ children, tone }: { children: React.ReactNode; tone?: Tone }) {
  return <b className={cn("font-semibold", toneClass(tone) ?? "text-foreground")}>{children}</b>;
}

/** A section's heading (17px bold), with the grey line under it that says what it counts. `aside` sits on the right. */
export function SectionHead({ id, title, sub, aside, className }: { id?: string; title: React.ReactNode; sub?: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-baseline gap-3">
        <h2 id={id} className="min-w-0 flex-1 text-title font-bold tracking-[-0.01em]">{title}</h2>
        {aside && <div className="flex shrink-0 items-center gap-3 text-caption text-muted-foreground">{aside}</div>}
      </div>
      {sub && <p className="mt-1 text-caption text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** "How this is worked out." — the footnote every analytics page ends on. */
export function HowNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("mt-[22px] max-w-[760px] text-caption text-muted-foreground", className)}>
      <b className="font-semibold text-ink-3">How this is worked out.</b> {children}
    </p>
  );
}

/** A bar either side of a centre line: right in `up`, left in `down` (or one `color` for both). `max` is the value at the track's edge. */
export function CenterBar({ value, max, color, className }: { value: number | null; max: number; color?: string; className?: string }) {
  const w = value === null || max <= 0 ? 0 : Math.min(1, Math.abs(value) / max) * 50;
  const neg = (value ?? 0) < 0;
  return (
    <span aria-hidden className={cn("relative block h-2", className)}>
      <span className="absolute -top-1 -bottom-1 left-1/2 w-px bg-bench-bar" />
      {w > 0 && (
        <span
          className="absolute top-0 h-2"
          style={{ left: neg ? `${50 - w}%` : "50%", width: `${w}%`, background: color ?? (neg ? "var(--down-line)" : "var(--up-line)") }}
        />
      )}
    </span>
  );
}

/** A share drawn from the left over a light track: 0 to `max`. */
export function ShareBar({ value, max, className }: { value: number | null; max: number; className?: string }) {
  const w = value === null || max <= 0 ? 0 : Math.min(1, Math.max(0, value) / max) * 100;
  return (
    <span aria-hidden className={cn("relative block h-1.5 bg-secondary", className)}>
      <span className="absolute inset-y-0 left-0 bg-series-1" style={{ width: `${w}%` }} />
    </span>
  );
}

/** Two flat bars over each other, for a weight beside a share: `a` in grey, `b` in ink, both against the same `max`. */
export function PairBars({ a, b, max, className }: { a: number; b: number; max: number; className?: string }) {
  const w = (v: number) => (max > 0 ? Math.min(1, Math.max(0, v) / max) * 100 : 0);
  return (
    <span aria-hidden className={cn("flex flex-col gap-[3px]", className)}>
      <span className="h-1 bg-bench-bar" style={{ width: `${w(a)}%` }} />
      <span className="h-1 bg-series-1" style={{ width: `${w(b)}%` }} />
    </span>
  );
}
