import type { Feedback } from "@/db/schema";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// Hoot's flags on a student's draft (an earnings reflection). It lists what he noticed and never
// rewrites the text: the learning boundary in docs/product.md. A section of the page, not a card: a title, one line
// on what the flags are, then a row per flag with its kind in the left column.
const FLAGS: { key: keyof Pick<Feedback, "unsupported" | "missing" | "alternatives" | "contradictions" | "questions">; label: string; title: string; tone: string }[] = [
  { key: "unsupported", label: "Unsupported", title: "A claim the evidence does not support", tone: "text-down" },
  { key: "missing", label: "Missing", title: "Evidence you have not addressed", tone: "text-caution-foreground" },
  { key: "alternatives", label: "Alternative", title: "An alternative explanation to rule out", tone: "text-foreground" },
  { key: "contradictions", label: "Thesis", title: "Tension with the recorded thesis", tone: "text-foreground" },
  { key: "questions", label: "Question", title: "A question to sharpen the argument", tone: "text-foreground" },
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
  const flags = FLAGS.flatMap((f) => feedback[f.key].map((text, i) => ({ id: `${f.key}-${i}`, label: f.label, title: f.title, tone: f.tone, text })));
  const stale = currentText !== undefined && (currentText ?? "").trim() !== (feedback.onText ?? "").trim();
  return (
    <section aria-label="Hoot's feedback" className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex items-baseline gap-2">
        <h2 className="flex-1 text-title font-bold tracking-[-0.01em]">{title}</h2>
        {stale ? <span className="text-caption font-semibold text-caution-foreground">On an earlier draft</span> : <span className="text-caption text-muted-foreground">{relativeTime(feedback.at)}</span>}
      </div>
      <p className="mt-1 text-caption text-muted-foreground">Hoot flags gaps. It doesn&apos;t suggest wording, and no flags wouldn&apos;t mean the write-up is right.</p>
      {flags.length === 0 ? (
        <p className="mt-2 border-b border-row py-2.5 text-body text-ink-2">No flags. That means the text is consistent with the gathered evidence, not that it is right.</p>
      ) : (
        <ul className="mt-2">
          {flags.map((f) => (
            <li key={f.id} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-b border-row py-2.5 text-body">
              <span title={f.title} className={cn("font-semibold", f.tone)}>
                {f.label}
              </span>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
