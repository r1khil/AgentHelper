"use client";
import { useEffect, useMemo } from "react";
import type { UIMessage } from "ai";
import { collectSources } from "@/lib/agent/citations";
import { savedAnalysis, type AnalysisPoint, type CallAnalysis } from "@/lib/sell-side/analysis";
import { Citation, ResearchAnswer, ResearchSources } from "@/components/app/chat/research-answer";
import { leaveHootQuestion } from "@/components/app/hoot/handoff";
import { Pill, type PillTone } from "@/components/app/panel";
import { cn } from "@/lib/utils";
import { useCallPane } from "./pane-context";
import { stamp } from "./timeline";

const citations = (ids: string[]) => ids.map((id) => <Citation key={id} id={id} />);

const VERDICT: Record<CallAnalysis["crossChecks"][number]["assessment"], { label: string; tone: PillTone }> = {
  Supports: { label: "Agrees", tone: "good" },
  Contradicts: { label: "Differs", tone: "caution" },
  "Not covered": { label: "Not in files", tone: "neutral" },
  "Not retrieved": { label: "Not retrieved", tone: "neutral" },
};

function Points({ title, points }: { title: string; points: AnalysisPoint[] }) {
  return (
    <section className="mt-5">
      <h4 className="text-[13.5px] font-semibold">{title}</h4>
      {points.length ? (
        <ul className="mt-1">
          {points.map((p, i) => (
            <li key={i} className="border-b border-row py-2 text-[13.5px] leading-relaxed">
              {p.text} {citations(p.sourceIds)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13px] text-muted-foreground">Not discussed in this call.</p>
      )}
    </section>
  );
}

/** The Brief tab: what was said (with when), how it checks against the team's files, and Hoot's next questions. */
export function AnalysisBrief({ messages, chatId }: { messages: UIMessage[]; chatId: string }) {
  const analysis = useMemo(() => savedAnalysis(messages), [messages]);
  const sources = useMemo(() => collectSources(messages), [messages]);
  const legacy = messages.findLast((m) => m.role === "assistant" && m.parts.some((p) => p.type === "text"));
  const { timeOf, setMarkers, openTranscriptAt, canAsk, openChat } = useCallPane();
  const times = useMemo(() => analysis?.keyPoints.map((p) => timeOf(p)) ?? [], [analysis, timeOf]);
  // Mark each key point on the call timeline above the tabs.
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
  const stampWidth = times.some((t) => t != null && t >= 3600) ? "w-[54px]" : "w-10";
  const ask = (text: string) => {
    leaveHootQuestion(chatId, text);
    openChat(true);
  };
  return (
    <ResearchSources sources={sources} chatId={chatId}>
      <section aria-label="Call analysis" className="flex min-h-0 flex-1 flex-col">
        {!analysis ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3.5">
            <h3 className="text-[14.5px] font-semibold">Call brief</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Evidence for analyst review</p>
            <div className="mt-2">{legacy?.parts.map((p, i) => (p.type === "text" ? <ResearchAnswer key={i} text={p.text} /> : null))}</div>
          </div>
        ) : (
          <>
            <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-2">
              <div className="min-w-0 px-5 py-3.5 lg:border-r">
                <h3 className="text-[14.5px] font-semibold">What was said</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
                  {analysis.overview.text} {citations(analysis.overview.sourceIds)}
                </p>
                <ul className="mt-1.5">
                  {analysis.keyPoints.map((p, i) => {
                    const t = times[i];
                    return (
                      <li key={i} className="flex gap-3 border-b border-row py-2.5">
                        {t != null ? (
                          <button
                            type="button"
                            onClick={() => openTranscriptAt(t)}
                            aria-label={`Open the transcript at ${stamp(t)}`}
                            className={cn(stampWidth, "h-fit shrink-0 pt-0.5 text-left font-mono text-xs font-medium text-series-1 outline-none hover:underline focus-visible:underline")}
                          >
                            {stamp(t)}
                          </button>
                        ) : (
                          <span className={cn(stampWidth, "shrink-0 pt-0.5 font-mono text-xs text-muted-foreground")}>—</span>
                        )}
                        <span className="min-w-0 text-[14px] leading-normal">
                          {p.text} {citations(p.sourceIds)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <section className="mt-5">
                  <h4 className="text-[13.5px] font-semibold">Important numbers</h4>
                  {analysis.numbers.length ? (
                    <ul className="mt-1">
                      {analysis.numbers.map((n, i) => (
                        <li key={i} className="border-b border-row py-2">
                          <div className="flex items-baseline gap-3">
                            <span className="min-w-0 flex-1 text-[13.5px] font-medium">{n.metric}</span>
                            <span className="shrink-0 text-right font-mono text-[13px] font-medium">{n.value}</span>
                          </div>
                          <p className="mt-0.5 text-[12.5px] leading-[1.45] text-muted-foreground">
                            <span className="text-ink-2">{n.period}</span> · {n.context} {citations(n.sourceIds)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[13px] text-muted-foreground">No reliable numbers identified.</p>
                  )}
                </section>
                <Points title="Positive commentary" points={analysis.positives} />
                <Points title="Risks & watch points" points={analysis.risks} />
                <Points title="Themes" points={analysis.themes} />
                <Points title="Catalysts" points={analysis.catalysts} />
              </div>
              <div className="min-w-0 border-t px-5 py-3.5 lg:border-t-0">
                <div className="flex items-baseline gap-2">
                  <h3 className="flex-1 text-[14.5px] font-semibold">Checked against the team’s files</h3>
                  <span className="text-xs whitespace-nowrap text-muted-foreground">by Hoot</span>
                </div>
                <ul className="mt-1.5">
                  {analysis.crossChecks.map((row, i) => {
                    const verdict = VERDICT[row.assessment];
                    return (
                      <li key={i} className="border-b border-row py-2.5">
                        <div className="flex items-start gap-2">
                          <p className="min-w-0 flex-1 text-[14px] leading-snug font-medium">
                            {row.claim} {citations(row.callSourceIds)}
                          </p>
                          <Pill tone={verdict.tone} title={`Assessment: ${row.assessment}`}>
                            {verdict.label}
                          </Pill>
                        </div>
                        <p className="mt-1 text-[12.5px] leading-[1.45] text-muted-foreground">
                          {row.evidence} {citations(row.internalSourceIds)}
                        </p>
                        <p className="mt-0.5 text-[12.5px] leading-[1.45] text-muted-foreground">
                          <span className="font-medium text-ink-2">Follow-up:</span> {row.followUp}
                        </p>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-ink-2">Coverage.</span> {analysis.coverage}
                </p>
              </div>
            </div>
            {analysis.questions.length > 0 && (
              <div className="flex max-h-[34%] shrink-0 flex-wrap items-center gap-x-3 gap-y-2 overflow-y-auto border-t bg-band-2 px-5 pt-3 pb-3.5">
                <h3 className="text-[13.5px] font-semibold whitespace-nowrap">Questions Hoot would ask next</h3>
                {analysis.questions.map((q, i) => (
                  <span key={i} className="inline-flex max-w-full items-center">
                    {canAsk ? (
                      <button
                        type="button"
                        onClick={() => ask(q.text)}
                        title="Ask Hoot in this call’s saved chat"
                        className="min-h-7 rounded-full bg-hoot px-3 py-1 text-left text-[12.5px] leading-snug font-medium text-hoot-foreground transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {q.text}
                      </button>
                    ) : (
                      <span className="min-h-7 rounded-full bg-hoot px-3 py-1 text-[12.5px] leading-snug font-medium text-hoot-foreground">{q.text}</span>
                    )}
                    {citations(q.sourceIds)}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </ResearchSources>
  );
}
