"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/app/native-select";

export function NewCall({ team, holdings }: { team: string; holdings: { id: string; ticker: string; companyName: string }[] }) {
  const router = useRouter();
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
            body: JSON.stringify(Object.fromEntries(fd)),
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
        <NativeSelect name="holdingId" required disabled={busy || !holdings.length}>
          {holdings.map((h) => (
            <option key={h.id} value={h.id}>
              {h.ticker} · {h.companyName}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="min-w-60 flex-1 space-y-1 text-sm">
        Call title
        <Input name="title" required maxLength={160} placeholder="Broker / analyst · topic" disabled={busy} />
      </label>
      <Button type="submit" disabled={busy || !holdings.length}>
        {busy ? "Creating…" : "New call"}
      </Button>
      {!holdings.length && <p>Add a company to your team holdings first.</p>}
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
