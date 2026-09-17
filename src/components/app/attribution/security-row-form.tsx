"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { setSecurityClassification } from "@/lib/actions/ledger";
import { GICS_SECTORS, SECTOR_LABELS, type GicsSector } from "@/lib/attribution/sectors";
import { NativeSelect } from "../native-select";

/** Sector and team selects for one security; saves on change. */
export function SecurityRowForm({ ticker, sector, teamId, teams }: { ticker: string; sector: GicsSector | null; teamId: string | null; teams: { id: string; name: string }[] }) {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const save = () => {
    if (!ref.current) return;
    // Read the form before the selects disable; disabled fields are left out of FormData.
    const fd = new FormData(ref.current);
    start(async () => {
      try {
        await setSecurityClassification(fd);
        toast.success(`Updated ${ticker}`);
      } catch {
        toast.error(`Could not update ${ticker}`);
      }
    });
  };
  return (
    <form ref={ref} className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <input type="hidden" name="ticker" value={ticker} />
      <NativeSelect name="sector" defaultValue={sector ?? ""} onChange={save} aria-label={`${ticker} sector`} className="w-52" disabled={pending}>
        <option value="">Unclassified</option>
        {GICS_SECTORS.map((s) => <option key={s} value={s}>{SECTOR_LABELS[s]}</option>)}
      </NativeSelect>
      <NativeSelect name="teamId" defaultValue={teamId ?? ""} onChange={save} aria-label={`${ticker} team`} className="w-56" disabled={pending}>
        <option value="">No team</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </NativeSelect>
    </form>
  );
}
