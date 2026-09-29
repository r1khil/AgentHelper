"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { completeMovement, reopenMovement, requestMovementFeedback, rerunEvidence, saveMovementUpdate } from "@/lib/actions/movements";
import { cn } from "@/lib/utils";
import { OwlMark } from "@/components/app/owl-mark";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { insertAt } from "./cite";
import type { MovementDetailData, MovementEvidence } from "./types";

/** A gathered source as the side list shows it; the dates are formatted on the server so hydration matches. */
export type EvidenceRow = MovementEvidence & { n: number; meta: string; citation: string };
export type EvidenceGroup = { kind: string; label: string; items: EvidenceRow[] };

/**
 * A movement's working area: the middle column (the big number, the team's update, Hoot's feedback once asked) and
 * the evidence Hoot gathered beside it. Each scrolls on its own. Cite drops a reference to a source into the update
 * at the cursor. The update belongs to the whole team: anyone on it can write and complete it.
 */
export function MovementWorkspace({
  d,
  head,
  status,
  groups,
  gathered,
  filings,
  feedback,
}: {
  d: MovementDetailData;
  /** The big number and the facts row, rendered on the server. */
  head: React.ReactNode;
  /** The update header's right side: "Draft, 120 words", "Completed 2h ago by Jane Doe", … */
  status: string;
  /** The evidence in display order, by kind. */
  groups: EvidenceGroup[];
  /** When Hoot last gathered, e.g. "Tue, Sep 22, 6:04 PM ET". */
  gathered: string | null;
  /** What the filings lookup found, as a sentence to follow "SEC filings:"; null when it found rows or hasn't run. */
  filings: string | null;
  /** Hoot's feedback section, when he has been asked. */
  feedback: React.ReactNode;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  // Until the writer has been in the box its caret is meaningless, so citations go at the end.
  const visited = useRef(false);
  const completed = d.status === "completed";

  // A new round of feedback lands below the update; bring it into view (not on first load).
  const round = useRef(d.feedback?.at);
  useEffect(() => {
    if (round.current === d.feedback?.at) return;
    round.current = d.feedback?.at;
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [d.feedback?.at]);

  function cite(e: EvidenceRow) {
    const el = editor.current;
    if (!el) return;
    const [from, to] = visited.current ? [el.selectionStart, el.selectionEnd] : [el.value.length, el.value.length];
    const r = insertAt(el.value, from, to, e.citation);
    el.focus();
    el.setSelectionRange(r.start, r.end);
    // insertText keeps the edit on the browser's undo stack; setRangeText is the fallback where it's unsupported.
    if (!document.execCommand("insertText", false, r.insert)) el.setRangeText(r.insert, r.start, r.end, "end");
    el.setSelectionRange(r.caret, r.caret);
  }

  return (
    <>
      <div data-tour="movement-detail" className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 pt-[26px] pb-10">
        {head}
        <div className="mt-[18px] flex items-baseline">
          <h2 className="flex-1 text-title font-bold tracking-[-0.01em]">Team update</h2>
          <span className="text-caption text-muted-foreground">{status}</span>
        </div>
        {completed ? (
          <>
            <p className="mt-2 border-y border-row py-3 text-emph whitespace-pre-wrap text-foreground">{d.updateText}</p>
            <form action={reopenMovement} className="mt-3">
              <input type="hidden" name="id" value={d.id} />
              <Button type="submit" variant="secondary">
                Reopen
              </Button>
            </form>
          </>
        ) : (
          <form>
            <input type="hidden" name="id" value={d.id} />
            <Textarea
              ref={editor}
              name="updateText"
              defaultValue={d.updateText ?? ""}
              rows={8}
              onFocus={() => (visited.current = true)}
              aria-label="Team update"
              placeholder={"What happened, what the evidence supports, what remains unexplained, and what it means for the thesis.\n\nCite the sources you relied on."}
              className="mt-2 min-h-40 resize-none rounded-none border-0 border-y border-t-row border-b-foreground bg-transparent px-0 py-3 text-emph leading-6 field-sizing-fixed focus-visible:border-b-foreground focus-visible:shadow-[0_1px_0_var(--foreground)] focus-visible:ring-0 md:text-emph"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {d.agentConfigured && (
                <FormButton formAction={requestMovementFeedback} pendingLabel="Asking Hoot…" title="Hoot flags unsupported claims, missing evidence, alternatives, and thesis contradictions. It never suggests wording.">
                  <OwlMark className="size-[18px] rounded-full" />
                  Ask Hoot for feedback
                </FormButton>
              )}
              <FormButton formAction={saveMovementUpdate} pendingLabel="Saving…">
                Save draft
              </FormButton>
              <span className="flex-1" />
              <span className="text-caption text-muted-foreground">Completing records your name and the time. Email the Fund separately; this keeps the record.</span>
              <FormButton formAction={completeMovement} pendingLabel="Completing…" primary>
                Mark complete
              </FormButton>
            </div>
          </form>
        )}
        {feedback && <div ref={feedbackRef} className="scroll-mt-4">{feedback}</div>}
      </div>
      <aside aria-label="Evidence Hoot gathered" className="flex w-80 shrink-0 flex-col overflow-y-auto border-l pt-[22px] pr-10 pb-10 pl-6">
        <div className="flex items-baseline">
          <h2 className="flex flex-1 items-center gap-2 text-body font-bold">
            <OwlMark className="size-[18px] rounded-full" />
            Evidence Hoot gathered
          </h2>
          <form action={rerunEvidence}>
            <input type="hidden" name="id" value={d.id} />
            <RegatherButton />
          </form>
        </div>
        <p className="mt-1 text-caption text-muted-foreground">
          These are possible catalysts, not the explanation.
          {gathered && <> Gathered {gathered}.</>}
        </p>
        {d.evidenceStatus === "pending" && d.evidence.length === 0 ? (
          <p className="mt-3 text-body text-muted-foreground">Evidence is still being gathered. Refresh in a moment.</p>
        ) : d.evidence.length === 0 ? (
          <p className="mt-3 text-body text-muted-foreground">Nothing found in the window. That is a finding too: say so in the update.</p>
        ) : (
          groups.map((g) => (
            <section key={g.kind} aria-label={g.label}>
              <h3 className="pt-3 pb-0.5 text-caption font-semibold text-muted-foreground">{g.label}</h3>
              <ul>
                {g.items.map((e) => (
                  <li key={e.id} className="grid grid-cols-[18px_minmax(0,1fr)] gap-1.5 border-b border-row py-[7px] text-caption">
                    <b className="font-semibold">{e.n}</b>
                    <span className="flex min-w-0 flex-col gap-[3px]">
                      <span className="text-body break-words">{e.title}</span>
                      {(e.meta || e.failed) && (
                        <span className="text-muted-foreground">
                          {e.meta}
                          {e.failed && <span className={cn("font-semibold text-caution-foreground", e.meta && "ml-1.5")}>lookup failed</span>}
                        </span>
                      )}
                      <span className="flex gap-2.5">
                        {!completed && (
                          <button
                            type="button"
                            onClick={() => cite(e)}
                            title={`Insert ${e.citation} at the cursor`}
                            aria-label={`Cite ${e.title}`}
                            className="rounded-sm font-semibold underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            Cite
                          </button>
                        )}
                        {e.url && (
                          <a href={e.url} target="_blank" rel="noreferrer" aria-label={`Open ${e.title}`} className="rounded-sm text-ink-2 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            Open
                          </a>
                        )}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
        {filings && (
          <p className="mt-2.5 text-caption text-ink-2">
            <b className="font-semibold">SEC filings:</b> {filings}
          </p>
        )}
        <Link href={d.askHootHref} className="mt-4 self-start text-caption font-semibold underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Ask Hoot about {d.ticker}
        </Link>
      </aside>
    </>
  );
}

/** A button inside the update form: greys out while any of its actions runs, and says what its own is doing. */
function FormButton({ formAction, pendingLabel, primary, title, children }: { formAction: (fd: FormData) => Promise<void>; pendingLabel: string; primary?: boolean; title?: string; children: React.ReactNode }) {
  // `action` is the submitting button's formAction, so only the button that was pressed changes its words.
  const { pending, action } = useFormStatus();
  return (
    <Button type="submit" formAction={formAction} variant={primary ? "default" : "secondary"} disabled={pending} title={title}>
      {pending && action === formAction ? pendingLabel : children}
    </Button>
  );
}

function RegatherButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="Re-gather news, filings, and peer moves"
      className="rounded-sm text-caption font-semibold underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground"
    >
      {pending ? "Re-gathering…" : "Re-gather"}
    </button>
  );
}
