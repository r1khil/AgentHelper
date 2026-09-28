"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";
import { completeMovement, reopenMovement, requestMovementFeedback, rerunEvidence, saveMovementUpdate } from "@/lib/actions/movements";
import { cn } from "@/lib/utils";
import { Panel, PanelFooter, PanelHeader, Segmented } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { insertAt } from "./cite";
import type { MovementDetailData, MovementEvidence } from "./types";

/** A gathered source as the side list shows it; the dates are formatted on the server so hydration matches. */
export type EvidenceRow = MovementEvidence & { n: number; meta: string; citation: string };

/**
 * A movement's working area: the team's update as the main column, tall and always in view, and beside it the
 * evidence Hoot gathered (and his feedback, once asked), which scrolls on its own. Cite drops a reference to a
 * source into the update at the cursor. The update belongs to the whole team: anyone on it can write and complete it.
 */
export function MovementWorkspace({
  d,
  status,
  evidence,
  gathered,
  feedback,
}: {
  d: MovementDetailData;
  /** The update header's right side: "Draft · 120 words", "Completed 2 hours ago by Jane Doe", … */
  status: string;
  /** The evidence in display order. */
  evidence: EvidenceRow[];
  /** When Hoot last gathered, e.g. "6:04 pm Tue". */
  gathered: string | null;
  /** Hoot's feedback panel, when he has been asked. */
  feedback: React.ReactNode;
}) {
  const editor = useRef<HTMLTextAreaElement>(null);
  // Until the writer has been in the box its caret is meaningless, so citations go at the end.
  const visited = useRef(false);
  const completed = d.status === "completed";

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
    <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <Panel className="focus-within:shadow-[0_0_0_1px_var(--border-strong)]">
        <PanelHeader title="Team update" aside={status} />
        {completed ? (
          <>
            <p className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5 text-[14.5px] leading-[1.6] whitespace-pre-wrap">{d.updateText}</p>
            <PanelFooter>
              <form action={reopenMovement}>
                <input type="hidden" name="id" value={d.id} />
                <Button type="submit" variant="outline">
                  Reopen
                </Button>
              </form>
            </PanelFooter>
          </>
        ) : (
          <form className="flex min-h-0 flex-1 flex-col">
            <input type="hidden" name="id" value={d.id} />
            <Textarea
              ref={editor}
              name="updateText"
              defaultValue={d.updateText ?? ""}
              rows={20}
              onFocus={() => (visited.current = true)}
              aria-label="Your update"
              placeholder={"What happened, what the evidence supports, what remains unexplained, and what it means for the thesis.\n\nCite the sources you relied on."}
              className="min-h-40 flex-1 resize-none rounded-none border-0 bg-transparent px-4 py-3 text-[14.5px] leading-[1.6] field-sizing-fixed focus-visible:ring-0 md:text-[14.5px]"
            />
            <PanelFooter className="flex-wrap gap-2">
              {d.agentConfigured && (
                <Button
                  type="submit"
                  formAction={requestMovementFeedback}
                  variant="outline"
                  title="Hoot flags unsupported claims, missing evidence, alternatives, and thesis contradictions."
                >
                  Ask Hoot for feedback
                </Button>
              )}
              <Button type="submit" formAction={saveMovementUpdate} variant="outline">
                Save draft
              </Button>
              <Button type="submit" formAction={completeMovement}>
                Mark complete
              </Button>
              <span className="min-w-0 flex-1 basis-64 text-xs">Completing records your name and time. Email the Fund separately; this keeps the record.</span>
            </PanelFooter>
          </form>
        )}
      </Panel>
      {/* A new round of feedback remounts the side, so it opens on what Hoot just said. */}
      <SidePane key={d.feedback?.at ?? "none"} d={d} evidence={evidence} gathered={gathered} feedback={feedback} onCite={completed ? undefined : cite} />
    </div>
  );
}

type Side = { d: MovementDetailData; evidence: EvidenceRow[]; gathered: string | null; onCite?: (e: EvidenceRow) => void };

function SidePane({ feedback, ...side }: Side & { feedback: React.ReactNode }) {
  const { d } = side;
  const fb = d.feedback;
  const fresh = !!fb && (d.updateText ?? "").trim() === (fb.onText ?? "").trim();
  const [tab, setTab] = useState<"evidence" | "feedback">(fresh ? "feedback" : "evidence");
  const flags = fb ? fb.unsupported.length + fb.missing.length + fb.alternatives.length + fb.contradictions.length + fb.questions.length : 0;
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3">
      {fb && (
        <Segmented
          label="Beside the update"
          className="self-start"
          segments={[
            { key: "evidence", label: `Evidence · ${d.evidence.length}`, active: tab === "evidence", onClick: () => setTab("evidence") },
            { key: "feedback", label: `Hoot's feedback · ${flags}`, active: tab === "feedback", onClick: () => setTab("feedback") },
          ]}
        />
      )}
      <EvidencePanel {...side} className={cn("min-h-0 flex-1", tab !== "evidence" && "hidden")} />
      {fb && <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto p-px", tab !== "feedback" && "hidden")}>{feedback}</div>}
    </div>
  );
}

function EvidencePanel({ d, evidence, gathered, onCite, className }: Side & { className?: string }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <Panel className={className}>
      <PanelHeader
        title="Evidence Hoot gathered"
        count={evidence.length}
        aside={
          <>
            {gathered && <span title={`${evidence.length} source${evidence.length === 1 ? "" : "s"}, gathered ${gathered}`}>{gathered}</span>}
            <form action={rerunEvidence}>
              <input type="hidden" name="id" value={d.id} />
              <Button type="submit" size="icon-xs" variant="ghost" title="Re-gather news, filings, and peer moves" aria-label="Re-gather evidence">
                <RefreshCw />
              </Button>
            </form>
          </>
        }
      />
      {d.evidenceStatus === "pending" && evidence.length === 0 ? (
        <p className="flex-1 px-4 py-3 text-[13.5px] text-muted-foreground">Evidence is still being gathered. Refresh in a moment.</p>
      ) : evidence.length === 0 ? (
        <p className="flex-1 px-4 py-3 text-[13.5px] text-muted-foreground">Nothing found in the window. That is a finding too: say so in the update.</p>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto">
          {evidence.map((e) => {
            const open = expanded.has(e.id);
            return (
              <li key={e.id} className="flex gap-2.5 border-b border-row py-2 pr-2 pl-4">
                <span className="mt-px grid h-[18px] min-w-[22px] shrink-0 place-items-center rounded-full bg-hoot px-1 font-mono text-[10.5px] font-medium text-hoot-foreground">{e.n}</span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => toggle(e.id)}
                    aria-expanded={open}
                    title={open ? "Show less" : e.title}
                    className={cn("block w-full rounded-sm pr-2 text-left text-[13.5px] leading-[1.45] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", !open && "truncate")}
                  >
                    {e.title}
                  </button>
                  <div className="flex min-h-6 items-center gap-1 text-xs text-muted-foreground">
                    <span className={cn("min-w-0", !open && "truncate")}>{e.meta}</span>
                    {e.failed && <span className="shrink-0 text-down">lookup failed</span>}
                    <span className="flex-1" />
                    {e.url && (
                      <Button nativeButton={false} render={<a href={e.url} target="_blank" rel="noreferrer" />} size="icon-xs" variant="ghost" title="Open the source" aria-label={`Open ${e.title}`}>
                        <ExternalLink />
                      </Button>
                    )}
                    {onCite && (
                      <Button type="button" size="xs" variant="ghost" onClick={() => onCite(e)} title={`Insert ${e.citation} at the cursor`}>
                        Cite
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <PanelFooter className="flex-wrap text-ink-2">
        <span className="min-w-0 flex-1 basis-40">These are possible catalysts, not the explanation.</span>
        <Button nativeButton={false} render={<Link href={d.askHootHref} />} size="sm" variant="outline">
          Ask Hoot about {d.ticker}
        </Button>
      </PanelFooter>
    </Panel>
  );
}
