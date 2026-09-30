"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { answerBearPointAction, runBearCaseAction } from "@/lib/actions/screener";

/** Paste the pitch's thesis and have Hoot argue against it. */
export function RunBearCase({ ticker, teamId, again }: { ticker: string; teamId: string | null; again: boolean }) {
  const [state, action, pending] = useActionState(runBearCaseAction, null);
  const [open, setOpen] = useState(!again);
  if (!open)
    return (
      <Button type="button" size="sm" variant="secondary" className="mt-5" onClick={() => setOpen(true)}>
        Run it again on a new pitch
      </Button>
    );
  return (
    <form action={action} className="mt-5 flex max-w-[760px] flex-col gap-2">
      <input type="hidden" name="ticker" value={ticker} />
      <input type="hidden" name="teamId" value={teamId ?? ""} />
      <label htmlFor="bear-pitch" className="text-caption text-muted-foreground">
        The pitch: its thesis and why now. Hoot keeps the opening if it has to shorten it.
      </label>
      <Textarea id="bear-pitch" name="pitch" required minLength={40} rows={6} placeholder={`Why ${ticker} is worth more than it trades for…`} className="text-body" />
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Arguing against it… (about a minute)" : "Run the bear case"}
        </Button>
        {state && !state.ok && (
          <p role="alert" className="text-caption font-semibold text-caution-foreground">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}

/** The team's written answer to one bear point. */
export function AnswerPoint({ id, index, response, by, editable }: { id: string; index: number; response: string; by: string | null; editable: boolean }) {
  const [draft, setDraft] = useState(response);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  if (!editing)
    return (
      <div className="mt-2 border-l border-border pl-3 text-body">
        {response ? (
          <>
            <p className="whitespace-pre-wrap text-foreground">{response}</p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              The team&apos;s answer{by ? `, ${by}` : ""}
              {editable && (
                <>
                  {". "}
                  <button type="button" onClick={() => setEditing(true)} className="font-semibold text-foreground hover:underline">
                    Edit
                  </button>
                </>
              )}
            </p>
          </>
        ) : (
          <p className="text-caption">
            <span className="font-semibold text-caution-foreground">Not answered yet</span>
            {editable && (
              <>
                {". "}
                <button type="button" onClick={() => setEditing(true)} className="font-semibold text-foreground hover:underline">
                  Answer it
                </button>
              </>
            )}
          </p>
        )}
      </div>
    );
  return (
    <form
      className="mt-2 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await answerBearPointAction(id, index, draft);
          if (!r.ok) toast.error(r.error);
          else setEditing(false);
        });
      }}
    >
      <label className="sr-only" htmlFor={`answer-${id}-${index}`}>
        The team&apos;s answer to point {index + 1}
      </label>
      <Textarea id={`answer-${id}-${index}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder="Why this doesn't break the thesis, or what would." className="text-body" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="secondary" disabled={pending || !draft.trim()}>
          {pending ? "Saving…" : "Save the answer"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => (setDraft(response), setEditing(false))}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
