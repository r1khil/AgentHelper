import type { Feedback } from "@/db/schema";
import { relativeTime } from "@/lib/format";

const SECTIONS: { key: keyof Pick<Feedback, "unsupported" | "missing" | "alternatives" | "contradictions" | "questions">; label: string }[] = [
  { key: "unsupported", label: "Claims the evidence does not support" },
  { key: "missing", label: "Evidence you have not addressed" },
  { key: "alternatives", label: "Alternative explanations to rule out" },
  { key: "contradictions", label: "Tension with the recorded thesis" },
  { key: "questions", label: "Questions to sharpen the argument" },
];

export function FeedbackPanel({ feedback }: { feedback: Feedback }) {
  const empty = SECTIONS.every((s) => feedback[s.key].length === 0);
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Agent feedback on your draft · {relativeTime(feedback.at)}</span>
        <span>{feedback.model}</span>
      </div>
      {empty ? (
        <p className="text-muted-foreground">No flags. That means the text is consistent with the gathered evidence, not that it is right.</p>
      ) : (
        <div className="space-y-2.5">
          {SECTIONS.filter((s) => feedback[s.key].length).map((s) => (
            <div key={s.key}>
              <div className="text-xs font-semibold">{s.label}</div>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
                {feedback[s.key].map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">The agent flags; you decide. It will not rewrite your text.</p>
    </div>
  );
}
