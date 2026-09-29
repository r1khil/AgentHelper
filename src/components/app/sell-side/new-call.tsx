"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NativeSelect } from "@/components/app/native-select";
import { cn } from "@/lib/utils";

type Holding = { id: string; ticker: string; companyName: string };
/** A team a call can be recorded for, with the holdings it can be about. */
export type CallTeam = { id: string; slug: string; name: string; holdings: Holding[] };

type Props = {
  /** One team's slug, id and holdings (a team scope)... */
  team?: string;
  teamId?: string;
  holdings?: Holding[];
  /** ...or several teams to choose from (the whole fund), and the scope to open the new call in. */
  teams?: CallTeam[];
  scope?: string;
  /** Called once the call exists and the page is on its way to it. */
  onCreated?: () => void;
};

/** "Record a call" as the page header's primary button; its form opens under it. */
export function RecordACall(props: Omit<Props, "onCreated">) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button />}>Record a call</PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] gap-0 p-4">
        <NewCall {...props} onCreated={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** Pick the company, name the call, then record it on the call's own page. */
export function NewCall({ team, teamId, holdings, teams, scope, onCreated }: Props) {
  const router = useRouter();
  const options: CallTeam[] = teams ?? [{ id: teamId ?? "", slug: team ?? "", name: "", holdings: holdings ?? [] }];
  const [teamPick, setTeamPick] = useState(options[0]?.id ?? "");
  const current = options.find((t) => t.id === teamPick) ?? options[0];
  const [company, setCompany] = useState(current?.holdings[0]?.id ?? "other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const holding = current?.holdings.find((h) => h.id === company);
  return (
    <form
      aria-label="Record a call"
      className="flex flex-col gap-2.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!current) return;
        setBusy(true);
        setError("");
        const fd = new FormData(e.currentTarget);
        try {
          const res = await fetch("/api/sell-side", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...Object.fromEntries(fd),
              teamId: current.id,
              companyType: company === "other" ? "other" : "holding",
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          router.push(`/t/${scope ?? current.slug}/sell-side/${data.id}`);
          onCreated?.();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not create call");
          setBusy(false);
        }
      }}
    >
      <h2 className="text-title font-bold tracking-[-0.01em]">Record a call</h2>
      {teams && (
        <NativeSelect
          aria-label="Team"
          value={current?.id}
          disabled={busy}
          onChange={(e) => {
            const next = options.find((t) => t.id === e.target.value);
            setTeamPick(e.target.value);
            setCompany(next?.holdings[0]?.id ?? "other");
          }}
        >
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
      )}
      <NativeSelect aria-label="Company" name="holdingId" value={company} onChange={(e) => setCompany(e.target.value)} disabled={busy}>
        {(current?.holdings ?? []).map((h) => (
          <option key={h.id} value={h.id}>
            {h.ticker} · {h.companyName}
          </option>
        ))}
        <option value="other">Other company</option>
      </NativeSelect>
      {company === "other" && (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
            <Input aria-label="Company name" name="companyName" required maxLength={120} placeholder="Company, e.g. Snowflake" disabled={busy} />
            <Input
              aria-label="Ticker"
              name="ticker"
              required
              maxLength={20}
              pattern="[A-Za-z0-9][A-Za-z0-9.:\-]{0,19}"
              placeholder="SNOW"
              disabled={busy}
              className={cn("font-mono uppercase placeholder:normal-case")}
            />
          </div>
          <p className="text-caption text-muted-foreground">No portfolio holding required. We’ll check any internal files available for this ticker.</p>
        </>
      )}
      <Input aria-label="Call title" name="title" required maxLength={160} placeholder="Title, e.g. “MS semis desk”" disabled={busy} />
      <Button type="submit" disabled={busy || !current || (!holding && company !== "other")} className="self-end">
        <span aria-hidden className="size-[9px] rounded-full bg-primary-foreground" />
        {busy ? "Creating…" : "Start recording"}
      </Button>
      {error && (
        <p role="alert" className="text-body text-caution-foreground">
          {error}
        </p>
      )}
    </form>
  );
}
