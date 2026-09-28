import { addNote } from "@/lib/actions/holdings";

/** "Add a note for the team…": one line, Enter adds it (the form resets after the action). The Notes tab has the multi-line composer. */
export function QuickNote({ holdingId }: { holdingId: string }) {
  return (
    <form action={addNote} className="min-w-0">
      <input type="hidden" name="holdingId" value={holdingId} />
      <input
        name="body"
        required
        aria-label="Add a note for the team"
        placeholder="Add a note for the team…"
        className="h-8 w-72 max-w-full rounded-lg bg-transparent px-2.5 text-right text-body placeholder:text-muted-foreground focus:bg-card focus:text-left focus:shadow-[0_0_0_1px_var(--border)] focus:outline-none"
      />
    </form>
  );
}
