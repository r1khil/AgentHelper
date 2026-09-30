import type { BearCase, CheckStatus, ChecklistItem } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import { StatusWord, type Tone } from "../parts";
import { CitedProse, SourceList } from "./cited-prose";
import { AnswerPoint, RunBearCase } from "./bear-controls";

const STATUS: Record<CheckStatus, { word: string; tone: Tone }> = {
  pass: { word: "Pass", tone: "grey" },
  watch: { word: "Watch", tone: "caution" },
  fail: { word: "Fail", tone: "caution" },
  no_data: { word: "No data", tone: "grey" },
};

/**
 * The bear case: the value-trap checklist (from code, before anything else), then Hoot's three strongest points
 * against the pitch, each cited, and the team's written answer to each.
 */
export function BearCaseTab({ ticker, teamId, checklist, bear, canRun, canAnswer }: { ticker: string; teamId: string | null; checklist: ChecklistItem[] | null; bear: BearCase | null; canRun: boolean; canAnswer: boolean }) {
  const fails = checklist?.filter((c) => c.status === "fail").length ?? 0;
  const watches = checklist?.filter((c) => c.status === "watch").length ?? 0;
  const answered = bear?.memo.filter((p) => p.response).length ?? 0;
  return (
    <div>
      <section aria-labelledby="bear-checklist">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id="bear-checklist" className="text-body font-semibold">
            Value-trap checklist
          </h2>
          {checklist && (
            <span className="text-caption text-muted-foreground">
              {fails} fail, {watches} to watch, computed from SEC filings
            </span>
          )}
        </div>
        {!checklist ? (
          <p className="border-b py-4 text-body text-muted-foreground">The checklist needs SEC filings, and they didn&apos;t load. Try again in a minute.</p>
        ) : (
          <ul className="mt-2 max-w-[760px]">
            {checklist.map((c) => (
              <li key={c.key} className="grid min-h-10 grid-cols-[minmax(0,200px)_72px_minmax(0,1fr)] items-baseline gap-3 border-b border-row py-2 text-body">
                <span className="font-semibold">{c.label}</span>
                <StatusWord tone={STATUS[c.status].tone}>{STATUS[c.status].word}</StatusWord>
                <span className="text-ink-2">{c.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="bear-memo" className="mt-9">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 id="bear-memo" className="text-body font-semibold">
            Hoot&apos;s case against it
          </h2>
          {bear?.status === "ready" && (
            <span className="text-caption text-muted-foreground">
              {fmtDate(bear.createdAt)}, {answered} of {bear.memo.length} answered
            </span>
          )}
        </div>
        {bear?.status === "held" && (
          <p className="mt-1 text-body">
            <StatusWord tone="caution">Held back</StatusWord> <span className="text-ink-2">{bear.heldReason}</span>
          </p>
        )}
        {bear?.status === "ready" && (
          <>
            <ol className="mt-3 flex max-w-[760px] flex-col gap-7">
              {bear.memo.map((p, i) => (
                <li key={i}>
                  <h3 className="text-emph font-semibold">
                    {i + 1}. {p.title}
                  </h3>
                  <CitedProse sentences={p.body} citations={bear.citations} className="hoot-prose mt-1 max-w-[68ch]" />
                  <AnswerPoint id={bear.id} index={i} response={p.response ?? ""} by={p.respondedBy ?? null} editable={canAnswer} />
                </li>
              ))}
            </ol>
            <SourceList citations={bear.citations} />
          </>
        )}
        {!bear && <p className="mt-1 max-w-[72ch] text-body text-ink-2">Before a buy goes to the execs, Hoot argues against it: the three strongest reasons the pitch is wrong, each cited. The team answers each one in writing.</p>}
        {canRun && <RunBearCase ticker={ticker} teamId={teamId} again={!!bear} />}
      </section>
    </div>
  );
}
