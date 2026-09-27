import type { Feedback } from "@/db/schema";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// Hoot's flags on a student's draft (movement update, earnings reflection). Pink because Hoot wrote it. It lists
// what he noticed and never rewrites the text: the learning boundary in docs/product.md.
const FLAGS: { key: keyof Pick<Feedback, "unsupported" | "missing" | "alternatives" | "contradictions" | "questions">; label: string; title: string }[] = [
  { key: "unsupported", label: "Unsupported", title: "A claim the evidence does not support" },
  { key: "missing", label: "Missing", title: "Evidence you have not addressed" },
  { key: "alternatives", label: "Alternative", title: "An alternative explanation to rule out" },
  { key: "contradictions", label: "Thesis", title: "Tension with the recorded thesis" },
  { key: "questions", label: "Question", title: "A question to sharpen the argument" },
];

export function FeedbackPanel({
  feedback,
  className,
  title = "Hoot's feedback on the draft",
  currentText,
}: {
  feedback: Feedback;
  className?: string;
  title?: React.ReactNode;
  /** The draft as it is now; when it differs from what Hoot read, the header says so. */
  currentText?: string | null;
}) {
  const flags = FLAGS.flatMap((f) => feedback[f.key].map((text, i) => ({ id: `${f.key}-${i}`, label: f.label, title: f.title, text })));
  const stale = currentText !== undefined && (currentText ?? "").trim() !== (feedback.onText ?? "").trim();
  return (
    <section className={cn("flex min-w-0 flex-col overflow-hidden rounded-[14px] bg-hoot-panel shadow-[0_0_0_1px_var(--hoot-panel-ring)]", className)}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-hoot-panel-ring px-4">
        <h2 className="text-[14.5px] font-semibold whitespace-nowrap">{title}</h2>
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {relativeTime(feedback.at)}
          {stale && " · on an earlier draft"}
        </span>
        <span className="flex-1" />
        <span className="text-[12.5px] whitespace-nowrap text-hoot-foreground">He flags, you decide</span>
      </div>
      {flags.length === 0 ? (
        <p className="flex-1 px-4 py-3 text-[13.5px] leading-[1.45] text-ink-2">No flags. That means the text is consistent with the gathered evidence, not that it is right.</p>
      ) : (
        <ul className="flex flex-1 flex-col">
          {flags.map((f) => (
            <li key={f.id} className="flex flex-1 gap-3 border-b border-hoot-panel-ring px-4 py-2.5 last:border-b-0">
              <span title={f.title} className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-card px-[9px] text-[11.5px] font-semibold whitespace-nowrap text-hoot-foreground">
                {f.label}
              </span>
              <div className="min-w-0 text-[13.5px] leading-[1.45]">{f.text}</div>
            </li>
          ))}
        </ul>
      )}
      <div className="shrink-0 border-t border-hoot-panel-ring px-4 py-2 text-xs text-muted-foreground">He never rewrites your text. What you keep is your call.</div>
    </section>
  );
}
