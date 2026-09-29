import { addNote, deleteNote } from "@/lib/actions/holdings";
import { fmtDay } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type NoteItem = { id: string; body: string; authorName: string | null; createdAt: Date; canDelete: boolean };

/** "Mon 28 Sep" (the app's day format), for note and feed metadata. */
export function monthDay(d: Date) {
  return fmtDay(d);
}

function initials(name: string | null) {
  const words = (name ?? "?").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
}

function NoteRow({ n }: { n: NoteItem }) {
  return (
    <li className="group flex gap-3 border-b border-row py-2.5">
      <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-muted text-caption font-semibold">{initials(n.authorName)}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-body text-muted-foreground">
          <span title={n.createdAt.toISOString()}>
            {n.authorName ?? "Unknown"}, {monthDay(n.createdAt)}
          </span>
          <span className="flex-1" />
          {n.canDelete && (
            <form action={deleteNote} className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <input type="hidden" name="id" value={n.id} />
              <button type="submit" className="text-body hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                Delete
              </button>
            </form>
          )}
        </div>
        <p className="mt-0.5 text-body leading-normal whitespace-pre-wrap">{n.body}</p>
      </div>
    </li>
  );
}

/** The team's notes on the Filings & notes tab: a full composer (multi-line) over every note, newest first. */
export function NotesTab({ holdingId, notes }: { holdingId: string; notes: NoteItem[] }) {
  return (
    <section aria-labelledby="notes-tab-h" className="min-w-0">
      <div className="flex min-h-9 items-center gap-2 border-b pb-1.5">
        <h2 id="notes-tab-h" className="text-emph font-semibold">
          Team notes
          {notes.length > 0 && <span className="ml-1.5 text-caption font-semibold text-muted-foreground tabular-nums">{notes.length}</span>}
        </h2>
      </div>
      <form action={addNote} className="grid gap-2 border-b border-row py-3">
        <input type="hidden" name="holdingId" value={holdingId} />
        <Textarea name="body" rows={2} aria-label="Add a note for the team" placeholder="Add a note for the team…" required />
        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="secondary">
            Add note
          </Button>
        </div>
      </form>
      {notes.length === 0 ? (
        <p className="py-4 text-body text-muted-foreground">No notes yet. Anything the team should know about this holding goes here.</p>
      ) : (
        <ul>
          {notes.map((n) => (
            <NoteRow key={n.id} n={n} />
          ))}
        </ul>
      )}
    </section>
  );
}
