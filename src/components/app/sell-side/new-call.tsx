"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/app/native-select";

export function NewCall({ team, teamId, holdings }: { team: string; teamId: string; holdings: { id: string; ticker: string; companyName: string }[] }) {
  const router = useRouter();
  const [company, setCompany] = useState(holdings[0]?.id ?? "other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const fd = new FormData(e.currentTarget);
        try {
          const res = await fetch("/api/sell-side", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...Object.fromEntries(fd),
              teamId,
              companyType: company === "other" ? "other" : "holding",
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          router.push(`/t/${team}/sell-side/${data.id}`);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not create call");
          setBusy(false);
        }
      }}
    >
      <label className="space-y-1 text-sm">
        Company
        <NativeSelect aria-label="Company" name="holdingId" value={company} onChange={(e) => setCompany(e.target.value)} disabled={busy}>
          {holdings.map((h) => (
            <option key={h.id} value={h.id}>
              {h.ticker} · {h.companyName}
            </option>
          ))}
          <option value="other">Other company</option>
        </NativeSelect>
      </label>
      {company === "other" && (
        <>
          <label className="space-y-1 text-sm">
            Company name
            <Input name="companyName" required maxLength={120} placeholder="e.g. Snowflake" disabled={busy} />
          </label>
          <label className="space-y-1 text-sm">
            Ticker
            <Input
              name="ticker"
              required
              maxLength={20}
              pattern="[A-Za-z0-9][A-Za-z0-9.:\-]{0,19}"
              placeholder="e.g. SNOW"
              className="uppercase"
              disabled={busy}
            />
          </label>
          <p className="w-full text-xs text-muted-foreground">No portfolio holding required. We’ll check any internal files available for this ticker.</p>
        </>
      )}
      <label className="min-w-60 flex-1 space-y-1 text-sm">
        Call title
        <Input name="title" required maxLength={160} placeholder="Broker / analyst · topic" disabled={busy} />
      </label>
      <Button type="submit" disabled={busy}>
        {busy ? "Creating…" : "New call"}
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
