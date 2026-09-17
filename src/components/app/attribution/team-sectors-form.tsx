"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/actions/holdings";
import { setTeamSectors } from "@/lib/actions/ledger";
import { GICS_SECTORS, SECTOR_LABELS, type GicsSector } from "@/lib/attribution/sectors";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "../native-select";

export function TeamSectorsForm({ teams, assigned }: { teams: { id: string; name: string }[]; assigned: Partial<Record<GicsSector, string>> }) {
  const [, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const result = await setTeamSectors(prev, fd);
    if (result.ok) toast.success(result.message ?? "Saved");
    else toast.error(result.error);
    return result;
  }, null);
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {GICS_SECTORS.map((s) => (
          <div key={s} className="grid gap-1">
            <Label htmlFor={`team_${s}`} className="font-normal">{SECTOR_LABELS[s]}</Label>
            <NativeSelect id={`team_${s}`} name={`team_${s}`} defaultValue={assigned[s] ?? ""}>
              <option value="">No team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </NativeSelect>
          </div>
        ))}
      </div>
      <div className="flex justify-end border-t pt-3">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save team sectors"}</Button>
      </div>
    </form>
  );
}
