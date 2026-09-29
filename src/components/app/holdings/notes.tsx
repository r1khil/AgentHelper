import { addNote, deleteNote } from "@/lib/actions/holdings";
import { fmtDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CountChip } from "@/components/app/panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { QuickNote } from "./quick-note";

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
            {n.authorName ?? "Unknown"} · {monthDay(n.createdAt)}
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

/** Overview's "Team notes": a one-line composer in the header and the notes, newest first. A plain section. */
export function NotesPanel({ holdingId, notes, className }: { holdingId: string; notes: NoteItem[]; className?: string }) {
  return (
    <section aria-labelledby="notes-h" className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex h-10 shrink-0 items-center gap-2">
        <h2 id="notes-h" className="text-title font-bold tracking-[-0.01em]">Team notes</h2>
        {notes.length > 0 && <CountChip>{notes.length}</CountChip>}
        <span className="flex-1" />
        <QuickNote holdingId={holdingId} />
      </div>
      {notes.length === 0 ? (
        <p className="py-1 text-body text-muted-foreground">No notes yet. Anything the team should know about this holding goes here.</p>
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

/** The Notes tab: a full composer (multi-line) and every note. */
export function NotesTab({ holdingId, notes }: { holdingId: string; notes: NoteItem[] }) {
  return (
    <section className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-4">
        <h2 className="text-emph font-semibold">Team notes</h2>
        <CountChip>{notes.length}</CountChip>
      </div>
      <form action={addNote} className="grid shrink-0 gap-2 border-b px-4 py-3">
        <input type="hidden" name="holdingId" value={holdingId} />
        <Textarea name="body" rows={3} placeholder="Add a note for the team…" required />
        <div className="flex justify-end">
          <Button type="submit" size="sm">
            Add note
          </Button>
        </div>
      </form>
      {notes.length === 0 ? (
        <p className="px-4 py-6 text-body text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="min-h-0 flex-1">
          {notes.map((n) => (
            <NoteRow key={n.id} n={n} />
          ))}
        </ul>
      )}
    </section>
  );
}
