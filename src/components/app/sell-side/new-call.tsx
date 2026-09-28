"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const field =
  "h-[34px] w-full min-w-0 rounded-[10px] bg-rail-2 px-3 text-body text-cream outline-none placeholder:text-rail-foreground focus-visible:ring-2 focus-visible:ring-cream/40 disabled:opacity-60";

/** The dark "Record a call" card: pick the company, name the call, then record it on the call's own page. */
export function NewCall({ team, teamId, holdings }: { team: string; teamId: string; holdings: { id: string; ticker: string; companyName: string }[] }) {
  const router = useRouter();
  const [company, setCompany] = useState(holdings[0]?.id ?? "other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const holding = holdings.find((h) => h.id === company);
  return (
    <form
      aria-label="Record a call"
      className="shrink-0 rounded-[14px] bg-rail p-3.5 text-cream"
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
      <h2 className="text-emph font-semibold">Record a call</h2>
      <div className="mt-2.5 flex flex-col gap-2">
        {/* The native select sits invisibly over a styled face, so the picker keeps native keyboard and screen-reader behavior. */}
        <div className={cn(field, "relative flex items-center gap-2 focus-within:ring-2 focus-within:ring-cream/40", busy && "opacity-60")}>
          {holding ? (
            <>
              <span className="font-mono font-semibold">{holding.ticker}</span>
              <span className="min-w-0 flex-1 truncate text-rail-foreground">or another company</span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate">Another company</span>
          )}
          <ChevronDown aria-hidden className="size-3.5 text-rail-foreground" />
          <select
            aria-label="Company"
            name="holdingId"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={busy}
            className="absolute inset-0 cursor-pointer rounded-[10px] text-foreground opacity-0"
          >
            {holdings.map((h) => (
              <option key={h.id} value={h.id}>
                {h.ticker} · {h.companyName}
              </option>
            ))}
            <option value="other">Other company</option>
          </select>
        </div>
        {company === "other" && (
          <>
            <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2">
              <input aria-label="Company name" name="companyName" required maxLength={120} placeholder="Company, e.g. Snowflake" disabled={busy} className={field} />
              <input
                aria-label="Ticker"
                name="ticker"
                required
                maxLength={20}
                pattern="[A-Za-z0-9][A-Za-z0-9.:\-]{0,19}"
                placeholder="SNOW"
                disabled={busy}
                className={cn(field, "font-mono uppercase placeholder:normal-case")}
              />
            </div>
            <p className="text-body leading-snug text-rail-foreground">No portfolio holding required. We’ll check any internal files available for this ticker.</p>
          </>
        )}
        <input aria-label="Call title" name="title" required maxLength={160} placeholder="Title, e.g. “MS semis desk”" disabled={busy} className={field} />
        <button
          type="submit"
          disabled={busy}
          className="flex h-[34px] w-full items-center justify-center gap-2 rounded-full bg-cream text-body font-semibold text-cream-foreground transition-opacity outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-cream/60 focus-visible:ring-offset-2 focus-visible:ring-offset-rail disabled:opacity-60"
        >
          <span aria-hidden className="size-[9px] rounded-full bg-down" />
          {busy ? "Creating…" : "Start recording"}
        </button>
        {error && (
          <p role="alert" className="text-body text-down-on-rail">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
