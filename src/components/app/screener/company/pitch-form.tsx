"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/app/native-select";
import { recordPitch } from "@/lib/actions/screener";
import { CONFIDENCE_LEVELS, parseCondition } from "@/lib/screener/calibration";

/**
 * Record a pitch: intrinsic value, target, horizon, confidence, the one metric the thesis depends on, and one to three
 * kill criteria written as conditions ("gross margin < 40%"). As each criterion is typed it says whether code can
 * check it or it becomes a quarterly review prompt.
 */
export function PitchForm({ ticker, teams, defaultTeamId, first }: { ticker: string; teams: { id: string; name: string }[]; defaultTeamId: string | null; first: boolean }) {
  const [open, setOpen] = useState(first);
  const [kills, setKills] = useState(["", ""]);
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof recordPitch>> | null, fd: FormData) => {
    const r = await recordPitch(prev, fd);
    if (r.ok) {
      toast.success(r.message ?? "Recorded.");
      setOpen(false);
      setKills(["", ""]);
    }
    return r;
  }, null);
  if (!open)
    return (
      <Button type="button" size="sm" variant="secondary" className="mt-8" onClick={() => setOpen(true)}>
        Record a new pitch
      </Button>
    );
  const field = "flex flex-col gap-1 text-caption text-muted-foreground";
  return (
    <form action={action} className="mt-8 max-w-[760px] border-t pt-5">
      <h2 className="text-body font-semibold">Record a pitch</h2>
      <input type="hidden" name="ticker" value={ticker} />
      <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3">
        <label className={field}>
          Team
          <NativeSelect name="teamId" defaultValue={defaultTeamId && teams.some((t) => t.id === defaultTeamId) ? defaultTeamId : teams[0].id}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className={field}>
          Intrinsic value per share ($)
          <Input name="intrinsicValue" type="number" step="0.01" min="0" required inputMode="decimal" />
        </label>
        <label className={field}>
          Price target ($)
          <Input name="priceTarget" type="number" step="0.01" min="0" required inputMode="decimal" />
        </label>
        <label className={field}>
          Horizon (months)
          <Input name="horizonMonths" type="number" min="1" max="60" defaultValue={12} required />
        </label>
        <label className={field}>
          Confidence it reaches the target
          <NativeSelect name="confidence" defaultValue="70">
            {CONFIDENCE_LEVELS.map((c) => (
              <option key={c} value={c}>
                {c}%
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className={field}>
          Pitched on
          <Input name="pitchedOn" type="date" />
        </label>
        <label className={`${field} col-span-3`}>
          The one metric the thesis depends on
          <Input name="keyMetric" required placeholder="FY27 operating margin ≥ 18%" />
        </label>
      </div>
      <fieldset className="mt-4">
        <legend className="text-caption text-muted-foreground">Kill criteria: what would prove it wrong (one to three)</legend>
        <div className="mt-1 flex flex-col gap-2">
          {kills.map((k, i) => {
            const parsed = k.trim() ? parseCondition(k) : null;
            return (
              <div key={i} className="flex items-center gap-3">
                <Input name="kill" value={k} onChange={(e) => setKills((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i === 0 ? "Gross margin < 40%" : "Another condition, or leave blank"} aria-label={`Kill criterion ${i + 1}`} />
                <span className="w-[150px] shrink-0 text-caption text-muted-foreground">{parsed ? (parsed.metric ? "Code checks it" : "Quarterly review") : ""}</span>
              </div>
            );
          })}
        </div>
        {kills.length < 3 && (
          <button type="button" onClick={() => setKills((xs) => [...xs, ""])} className="mt-2 text-caption font-semibold hover:underline">
            Add a third
          </button>
        )}
      </fieldset>
      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Recording…" : "Record the pitch"}
        </Button>
        {!first && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        )}
        {state && !state.ok && (
          <p role="alert" className="text-caption font-semibold text-caution-foreground">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
