"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { SavedScenarioSummary } from "@/lib/backtesting/saved";
import { fmtDate } from "@/lib/format";

/** Saved what-ifs for this Fund or team, each a shareable link that reopens it on this page. */
export function SavedScenarios({ items, activeId, viewerId, fundWide }: { items: SavedScenarioSummary[]; activeId?: string; viewerId: string; fundWide: boolean }) {
  const { busy, remove } = useRemoveScenario();
  if (!items.length) return null;
  return (
    <details className="mb-5 rounded-xl ring-1 ring-foreground/10" open={Boolean(activeId)}>
      <summary className="cursor-pointer px-4 py-3 text-body font-medium">
        Saved scenarios <span className="font-normal text-muted-foreground">{items.length}</span>
      </summary>
      <ul className="divide-y border-t text-body">
        {items.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <div className="min-w-0">
              <Link href={`?scenario=${s.id}`} className={s.id === activeId ? "font-semibold" : "font-medium hover:underline"}>{s.name}</Link>
              <div className="text-body text-muted-foreground">
                {s.changes} change{s.changes === 1 ? "" : "s"}, {fmtDate(s.from)} – {fmtDate(s.to)} vs {s.benchmark}. {s.createdBy ?? "Someone"}, {fmtDate(s.createdAt)}
              </div>
              {s.note && <div className="mt-0.5 max-w-xl text-caption text-muted-foreground">{s.note}</div>}
            </div>
            {(fundWide || s.createdById === viewerId) && (
              <Button type="button" size="sm" variant="ghost" disabled={busy === s.id} onClick={() => void remove(s.id)}>Remove</Button>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Removing a saved scenario (for everyone in scope), after a confirm. `busy` is the id being removed. */
export function useRemoveScenario() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function remove(id: string) {
    if (!window.confirm("Remove this saved scenario for everyone?")) return;
    setBusy(id);
    await fetch(`/api/backtesting/scenarios?id=${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    router.refresh();
  }
  return { busy, remove };
}

type SaveProps = { onSave: (name: string, note: string) => Promise<{ id?: string; error?: string }>; disabled: boolean; audience: string };

/** Name the scenario on screen and save it; the result is a link anyone in scope can open. */
export function SaveScenario(props: SaveProps) {
  return (
    <Card data-tour="bt-save" className="mb-6 gap-3 p-4">
      <SaveScenarioFields {...props} />
    </Card>
  );
}

/** The save form itself, for a card (classic) or a popover (redesign). */
export function SaveScenarioFields({ onSave, disabled, audience }: SaveProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const link = saved ? `${typeof window === "undefined" ? "" : window.location.origin}/backtesting?scenario=${saved}` : "";

  async function save() {
    setBusy(true);
    setError("");
    const r = await onSave(name.trim(), note.trim());
    setBusy(false);
    if (r.error || !r.id) return setError(r.error ?? "Could not save the scenario.");
    setSaved(r.id);
    router.refresh();
  }

  return (
    <>
      <div className="text-body font-medium">
        Save and share <span className="font-normal text-muted-foreground">, keeps these weights, dates and benchmark under a link {audience} can open</span>
      </div>
      {saved ? (
        <div className="flex flex-wrap items-center gap-2 text-body">
          <Input readOnly value={link} className="max-w-md" aria-label="Scenario link" onFocus={(e) => e.target.select()} />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setCopied(true));
            }}
          >
            {copied ? <Check /> : <Link2 />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setSaved(null); setName(""); setNote(""); setCopied(false); }}>Save another</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Input aria-label="Scenario name" placeholder="Name, e.g. Trim semis 2pp into cash" className="max-w-xs" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          <Input aria-label="Note" placeholder="Note (optional)" className="max-w-sm" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="button" disabled={disabled || busy || !name.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save scenario"}</Button>
        </div>
      )}
      {error && <p role="alert" className="text-body text-destructive">{error}</p>}
    </>
  );
}
