"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Segmented } from "@/components/app/panel";
import { setFilingChangeVerdict } from "@/lib/screener/filing-changes/actions";

type Verdict = "real" | "noise" | null;

/**
 * A lead's one-click verdict on a filing change: Real or Noise (clicking the chosen one again clears it). The share
 * marked real is how the fund learns whether the detector is worth keeping.
 */
export function VerdictControl({ id, verdict, disabled }: { id: string; verdict: Verdict; disabled?: boolean }) {
  const [shown, setShown] = useOptimistic(verdict);
  const [, start] = useTransition();
  const pick = (v: Exclude<Verdict, null>) =>
    start(async () => {
      const next = shown === v ? null : v;
      setShown(next);
      const r = await setFilingChangeVerdict(id, next);
      if (r && "ok" in r && !r.ok) toast.error(r.error);
    });
  if (disabled) return verdict ? <span className="text-caption font-semibold text-muted-foreground">{verdict === "real" ? "Real" : "Noise"}</span> : null;
  return (
    <Segmented
      label="Is this change real?"
      segments={(["real", "noise"] as const).map((v) => ({ key: v, label: v === "real" ? "Real" : "Noise", active: shown === v, onClick: () => pick(v), title: shown === v ? "Click again to clear" : undefined }))}
    />
  );
}
