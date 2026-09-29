"use client";
import { useEffect, useMemo } from "react";
import type { UIMessage } from "ai";
import { collectSources } from "@/lib/agent/citations";
import { savedAnalysis, type AnalysisPoint, type CallAnalysis } from "@/lib/sell-side/analysis";
import { Citation, ResearchAnswer, ResearchSources } from "@/components/app/chat/research-answer";
import { leaveHootQuestion } from "@/components/app/hoot/handoff";
import { cn } from "@/lib/utils";
import { useCallPane } from "./pane-context";

const citations = (ids: string[]) => ids.map((id) => <Citation key={id} id={id} />);

/** How a claim on the call checks against the team's files, in the words the brief uses. */
const VERDICT: Record<CallAnalysis["crossChecks"][number]["assessment"], { label: string; tone: string }> = {
  Supports: { label: "Matches", tone: "text-foreground" },
  Contradicts: { label: "Differs", tone: "text-caution-foreground" },
  "Not covered": { label: "Not in files", tone: "text-muted-foreground" },
  "Not retrieved": { label: "Not retrieved", tone: "text-caution-foreground" },
};

const CHECK_GRID = "grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_110px] items-start gap-x-3";
const H3 = "mt-[22px] mb-1.5 text-body font-bold";

function Points({ title, points }: { title: string; points: AnalysisPoint[] }) {
  return (
    <section>
      <h3 className={H3}>{title}</h3>
      {points.length ? (
        <ul>
          {points.map((p, i) => (
            <li key={i} className="border-b border-row py-[7px] text-body leading-5">
              {p.text} {citations(p.sourceIds)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-muted-foreground">Not discussed in this call.</p>
      )}
    </section>
  );
}

/**
 * The Call brief tab: what was said, the numbers checked against the team's files, and Hoot's next questions, then
 * the commentary by kind. The times each point was said sit in the timeline beside the call, not in the rows.
 */
export function AnalysisBrief({ messages, chatId }: { messages: UIMessage[]; chatId: string }) {
  const analysis = useMemo(() => savedAnalysis(messages), [messages]);
  const sources = useMemo(() => collectSources(messages), [messages]);
  const legacy = messages.findLast((m) => m.role === "assistant" && m.parts.some((p) => p.type === "text"));
  const { timeOf, setMarkers, canAsk, openChat } = useCallPane();
  const times = useMemo(() => analysis?.keyPoints.map((p) => timeOf(p)) ?? [], [analysis, timeOf]);
  // List each key point on the call's timeline, at the moment it was said.
  useEffect(() => {
    setMarkers(
      analysis
        ? analysis.keyPoints.flatMap((p, i) => {
            const t = times[i];
            return t == null ? [] : [{ t, label: p.text }];
          })
        : [],
    );
  }, [analysis, times, setMarkers]);
  useEffect(() => () => setMarkers([]), [setMarkers]);
  const ask = (text: string) => {
    leaveHootQuestion(chatId, text);
    openChat(true);
  };
  return (
    <ResearchSources sources={sources} chatId={chatId}>
      <section aria-label="Call analysis" className="min-w-0">
        {!analysis ? (
          <div className="pt-1">
            <h3 className={H3}>Call brief</h3>
            <p className="text-caption text-muted-foreground">Evidence for analyst review</p>
            <div className="mt-2">{legacy?.parts.map((p, i) => (p.type === "text" ? <ResearchAnswer key={i} text={p.text} /> : null))}</div>
          </div>
        ) : (
          <>
            <h3 className={cn(H3, "mt-4")}>What was said</h3>
            <p className="border-b border-row pb-[7px] text-body leading-5 text-ink-2">
              {analysis.overview.text} {citations(analysis.overview.sourceIds)}
            </p>
            <ul>
              {analysis.keyPoints.map((p, i) => (
                <li key={i} className="border-b border-row py-[7px] text-body leading-5">
                  {p.text} {citations(p.sourceIds)}
                </li>
              ))}
            </ul>

            <h3 className={H3}>Important numbers, checked against the team&apos;s files</h3>
            <div role="table" aria-label="Numbers" className="text-body">
              <div role="row" className={cn(CHECK_GRID, "h-[30px] items-center border-b text-caption text-muted-foreground")}>
                <span role="columnheader">Said on the call</span>
                <span role="columnheader">Team&apos;s files</span>
                <span role="columnheader">Check</span>
              </div>
              {analysis.crossChecks.map((row, i) => {
                const verdict = VERDICT[row.assessment];
                return (
                  <div key={i} role="row" className={cn(CHECK_GRID, "min-h-10 border-b border-row py-2")}>
                    <span role="cell" className="leading-5">
                      {row.claim} {citations(row.callSourceIds)}
                    </span>
                    <span role="cell" className="leading-5 text-ink-2">
                      {row.evidence} {citations(row.internalSourceIds)}
                      <span className="mt-0.5 block text-caption text-muted-foreground">
                        <span className="font-semibold text-ink-2">Follow-up:</span> {row.followUp}
                      </span>
                    </span>
                    <span role="cell" title={`Assessment: ${row.assessment}`} className={cn("font-semibold", verdict.tone)}>
                      {verdict.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <h4 className="mt-4 mb-0.5 text-caption font-semibold text-muted-foreground">Numbers mentioned on the call</h4>
            {analysis.numbers.length ? (
              <ul>
                {analysis.numbers.map((n, i) => (
                  <li key={i} className="border-b border-row py-[7px]">
                    <div className="flex items-baseline gap-3 text-body">
                      <span className="min-w-0 flex-1 font-semibold">{n.metric}</span>
                      <span className="shrink-0 text-right font-semibold">{n.value}</span>
                    </div>
                    <p className="text-caption text-muted-foreground">
                      <span className="text-ink-2">{n.period}</span> · {n.context} {citations(n.sourceIds)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-muted-foreground">No reliable numbers identified.</p>
            )}

            {analysis.questions.length > 0 && (
              <section>
                <h3 className={H3}>Questions Hoot would ask next</h3>
                <ul>
                  {analysis.questions.map((q, i) => (
                    <li key={i} className="flex items-baseline gap-3 border-b border-row py-[7px] text-body leading-5">
                      <span className="min-w-0 flex-1">
                        {q.text} {citations(q.sourceIds)}
                      </span>
                      {canAsk && (
                        <button
                          type="button"
                          onClick={() => ask(q.text)}
                          title="Ask Hoot in this call’s discussion"
                          className="shrink-0 rounded-sm text-caption font-semibold underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Ask Hoot
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <Points title="Positive commentary" points={analysis.positives} />
            <Points title="Risks & watch points" points={analysis.risks} />
            <Points title="Themes" points={analysis.themes} />
            <Points title="Catalysts" points={analysis.catalysts} />
            <p className="mt-4 text-caption leading-relaxed text-muted-foreground">
              <span className="font-semibold text-ink-2">Coverage.</span> {analysis.coverage}
            </p>
          </>
        )}
      </section>
    </ResearchSources>
  );
}
