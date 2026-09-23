"use client";
import type { UIMessage } from "ai";
import { collectSources } from "@/lib/agent/citations";
import { savedAnalysis, type AnalysisPoint } from "@/lib/sell-side/analysis";
import { Citation, ResearchAnswer, ResearchSources } from "@/components/app/chat/research-answer";

const citations = (ids: string[]) => ids.map((id) => <Citation key={id} id={id} />);
function Points({ title, points }: { title: string; points: AnalysisPoint[] }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {points.length ? (
        <ul className="space-y-3">
          {points.map((p, i) => (
            <li key={i} className="text-sm leading-relaxed">
              {p.text} {citations(p.sourceIds)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Not discussed in this call.</p>
      )}
    </section>
  );
}
export function AnalysisBrief({ messages, chatId }: { messages: UIMessage[]; chatId: string }) {
  const analysis = savedAnalysis(messages);
  const sources = collectSources(messages);
  const legacy = messages.findLast((m) => m.role === "assistant" && m.parts.some((p) => p.type === "text"));
  return (
    <ResearchSources sources={sources} chatId={chatId}>
      <section aria-label="Call analysis" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Call brief</h2>
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Evidence for analyst review</span>
        </div>
        {!analysis ? (
          <div className="rounded-xl border bg-card p-5">
            {legacy?.parts.map((p, i) => (p.type === "text" ? <ResearchAnswer key={i} text={p.text} /> : null))}
          </div>
        ) : (
          <>
            <div className="rounded-xl border bg-muted/30 p-5 text-sm leading-relaxed">
              {analysis.overview.text} {citations(analysis.overview.sourceIds)}
            </div>
            <Points title="Key points" points={analysis.keyPoints} />
            <section className="space-y-3 rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold">Important numbers</h3>
              {analysis.numbers.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b text-xs text-muted-foreground">
                      <tr>
                        <th className="pb-3 pr-4">Metric</th>
                        <th className="pb-3 pr-4">Call figure</th>
                        <th className="pb-3 pr-4">Period</th>
                        <th className="pb-3">Context & evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.numbers.map((n, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-3 pr-4 font-medium">{n.metric}</td>
                          <td className="py-3 pr-4 tabular-nums">{n.value}</td>
                          <td className="py-3 pr-4">{n.period}</td>
                          <td className="py-3">
                            {n.context} {citations(n.sourceIds)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No reliable numbers identified.</p>
              )}
            </section>
            <div className="grid gap-4 md:grid-cols-2">
              <Points title="Positive commentary" points={analysis.positives} />
              <Points title="Risks & watch points" points={analysis.risks} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Points title="Themes" points={analysis.themes} />
              <Points title="Catalysts" points={analysis.catalysts} />
            </div>
            <section className="space-y-4 rounded-xl border bg-card p-5">
              <h3 className="text-sm font-semibold">Internal-file cross-check</h3>
              <p className="text-sm text-muted-foreground">{analysis.coverage}</p>
              {analysis.crossChecks.map((row, i) => (
                <div key={i} className="space-y-2 border-t pt-4 text-sm">
                  <span className="inline-block rounded bg-muted px-2 py-1 text-xs font-medium">{row.assessment}</span>
                  <p className="font-medium">
                    {row.claim} {citations(row.callSourceIds)}
                  </p>
                  <p>
                    {row.evidence} {citations(row.internalSourceIds)}
                  </p>
                  <p className="text-muted-foreground">Follow-up: {row.followUp}</p>
                </div>
              ))}
            </section>
            <Points title="Follow-up questions" points={analysis.questions} />
          </>
        )}
      </section>
    </ResearchSources>
  );
}
