"use client";

import { useState } from "react";
import { updateThesis } from "@/lib/actions/holdings";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * The team's thesis in its own words, with "Edit". Hoot reads it for context but never edits it; a thesis the app
 * extracted from a report shows above as a proposal (`proposal`) until someone accepts or dismisses it.
 */
export function ThesisPanel({ holdingId, thesis, meta, flash, proposal }: { holdingId: string; thesis: string | null; meta?: string; flash?: string; proposal?: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const text = thesis?.trim() ?? "";
  return (
    <section id="thesis" aria-labelledby="thesis-h" className="min-w-0 shrink-0 scroll-mt-6">
      <div className="flex items-baseline gap-2">
        <h2 id="thesis-h" className="text-title font-bold tracking-[-0.01em]">Thesis</h2>
        {meta && <span className="text-body whitespace-nowrap text-muted-foreground">{meta}</span>}
        <span className="flex-1" />
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-body font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            {text ? "Edit" : "Write"}
          </button>
        )}
      </div>
      {flash && <p className="mt-2 text-body text-destructive">{flash}</p>}
      {proposal && <div className="mt-3">{proposal}</div>}
      {editing ? (
        <form
          action={async (fd) => {
            await updateThesis(fd);
            setEditing(false);
          }}
          className="mt-2 grid gap-2"
        >
          <input type="hidden" name="holdingId" value={holdingId} />
          <Textarea name="thesis" defaultValue={text} rows={5} autoFocus placeholder="Why the team owns it, and what would change that view." />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Save thesis
            </Button>
          </div>
        </form>
      ) : text ? (
        <p className="mt-2 text-emph text-pretty whitespace-pre-wrap">{text}</p>
      ) : (
        <p className="mt-2 text-body text-muted-foreground">No thesis written yet. Write why the team owns it; Hoot checks movement updates and earnings reflections against it.</p>
      )}
    </section>
  );
}
