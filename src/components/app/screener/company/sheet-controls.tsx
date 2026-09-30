"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/app/panel";
import { rateTearSheet, writeTearSheetAction } from "@/lib/actions/screener";

type Rating = "useful" | "not_useful" | null;

/** Was the tear sheet useful? One rating per sheet; the share rated useful is how the fund judges Module 2. */
export function RateSheet({ id, rating }: { id: string; rating: Rating }) {
  const [shown, setShown] = useOptimistic(rating);
  const [, start] = useTransition();
  const pick = (r: Exclude<Rating, null>) =>
    start(async () => {
      const next = shown === r ? null : r;
      setShown(next);
      const res = await rateTearSheet(id, next);
      if (!res.ok) toast.error(res.error);
    });
  return (
    <span className="flex items-center gap-2">
      <span>Useful?</span>
      <Segmented
        label="Was this tear sheet useful?"
        segments={[
          { key: "useful", label: "Yes", active: shown === "useful", onClick: () => pick("useful") },
          { key: "not_useful", label: "No", active: shown === "not_useful", onClick: () => pick("not_useful") },
        ]}
      />
    </span>
  );
}

/** Write (or rewrite) the tear sheet now. Takes a minute: it reads the 10-K and 10-Q first. */
export function WriteSheet({ hitId, label, quiet }: { hitId: string; label: string; quiet?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant={quiet ? "ghost" : "secondary"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await writeTearSheetAction(hitId);
          if (!r.ok) toast.error(r.error);
        })
      }
    >
      {pending ? "Writing… (about a minute)" : label}
    </Button>
  );
}
