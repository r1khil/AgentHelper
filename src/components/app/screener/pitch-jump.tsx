"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { companyHref } from "./parts";

/** Record a pitch: a ticker, then the company's Pitch tab, where the estimates and kill criteria are written. */
export function PitchJump() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const clean = ticker.trim().toUpperCase().replace(/^\$/, "");
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean) router.push(companyHref(clean, "pitch"));
      }}
    >
      <label className="sr-only" htmlFor="pitch-ticker">
        Ticker to record a pitch for
      </label>
      <Input id="pitch-ticker" value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="Ticker" autoComplete="off" spellCheck={false} className="h-[30px] w-24" />
      <Button type="submit" size="sm" variant="secondary" disabled={!clean}>
        Record a pitch
      </Button>
    </form>
  );
}
